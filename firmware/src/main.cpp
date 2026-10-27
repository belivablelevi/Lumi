// Lumi firmware entry point: wires the portable App (lib/lumi_core) to the
// ESP32-C3 hardware - display, accelerometer, ESP-NOW radio, Wi-Fi updater
// and deep sleep.
#include <Arduino.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <Wire.h>
#include <esp_now.h>
#include <esp_sleep.h>
#include <esp_wifi.h>
#if defined(CONFIG_IDF_TARGET_ESP32S3)
#include <driver/rtc_io.h>
#endif
#include <time.h>

#include "app.h"
#include "config.h"
#include "imu.h"
#include "ssd1306.h"

using lumi::pong::Packet;

// ---------------------------------------------------------------------------
// State that survives deep sleep. Kept as raw bytes so no constructor ever
// re-initialises it on wake; Mood validates it with a magic number.
RTC_DATA_ATTR alignas(4) static uint8_t gMoodRaw[sizeof(lumi::MoodState)];
RTC_DATA_ATTR static time_t gSleptAt = 0;
RTC_DATA_ATTR static uint32_t gWakeCount = 0;

static Ssd1306 display;
static Imu imu;
static bool displayOk = false, imuOk = false;
static QueueHandle_t rxQueue = nullptr;
static lumi::Canvas canvas;
static uint8_t shown[lumi::kBufferSize];
static float lastX = 0, lastY = 0, lastZ = 0;

static const uint8_t kBroadcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// ---------------------------------------------------------------------------
// ESP-NOW receive callback (runs in the Wi-Fi task; hand off via a queue).

#if ESP_ARDUINO_VERSION_MAJOR >= 3
static void onEspNowRecv(const esp_now_recv_info_t*, const uint8_t* data, int len) {
#else
static void onEspNowRecv(const uint8_t*, const uint8_t* data, int len) {
#endif
  if (len != (int)sizeof(Packet) || !rxQueue) return;
  Packet p;
  memcpy(&p, data, sizeof(p));
  xQueueSend(rxQueue, &p, 0);
}

// ---------------------------------------------------------------------------
// Wi-Fi updater page.

static const char kUpdatePage[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lumi update</title>
<style>
body{font-family:system-ui,sans-serif;background:#0b1015;color:#d8f6ff;max-width:420px;margin:40px auto;padding:0 16px}
h1{font-size:22px}button{background:#38e1ff;color:#000;border:0;border-radius:8px;padding:10px 18px;font-size:16px}
progress{width:100%;height:18px;margin:16px 0}input{margin:12px 0}
</style></head><body>
<h1>Lumi firmware update</h1>
<p>Pick a <code>firmware.bin</code> built with PlatformIO, then press install. Keep Lumi close by until it restarts.</p>
<input type="file" id="f" accept=".bin"><br>
<button onclick="go()">Install</button>
<progress id="p" max="100" value="0"></progress>
<div id="s"></div>
<script>
function go(){const f=document.getElementById('f').files[0];if(!f)return;
const x=new XMLHttpRequest(),p=document.getElementById('p'),s=document.getElementById('s');
x.upload.onprogress=e=>{p.value=e.loaded*100/e.total};
x.onload=()=>{s.textContent=x.responseText};x.onerror=()=>{s.textContent='Upload failed'};
const d=new FormData();d.append('firmware',f);x.open('POST','/update?size='+f.size);x.send(d);}
</script></body></html>)HTML";

// ---------------------------------------------------------------------------

class DeviceHal : public lumi::Hal {
 public:
  uint32_t millis() override { return ::millis(); }
  uint32_t random32() override { return esp_random(); }

  uint16_t batteryMv() override {
    uint32_t sum = 0;
    for (int i = 0; i < 8; ++i) sum += analogReadMilliVolts(LUMI_PIN_BATTERY);
    return (uint16_t)(sum / 8 * LUMI_BATTERY_DIVIDER);
  }

  bool usbPowered() override {
#if LUMI_PIN_USB_SENSE >= 0
    return digitalRead(LUMI_PIN_USB_SENSE);
#else
    return false;
#endif
  }

  void macAddress(uint8_t mac[6]) override {
    const uint64_t efuse = ESP.getEfuseMac();
    for (int i = 0; i < 6; ++i) mac[i] = (efuse >> (8 * i)) & 0xFF;
  }

  void setContrast(uint8_t level) override {
    if (displayOk) display.contrast(level);
  }

  bool radioStart() override {
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    esp_wifi_set_channel(LUMI_ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
    if (esp_now_init() != ESP_OK) return false;
    esp_now_register_recv_cb(onEspNowRecv);
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, kBroadcast, 6);
    peer.channel = LUMI_ESPNOW_CHANNEL;
    peer.ifidx = WIFI_IF_STA;
    peer.encrypt = false;
    if (esp_now_add_peer(&peer) != ESP_OK) {
      esp_now_deinit();
      return false;
    }
    radioOn_ = true;
    return true;
  }

  void radioStop() override {
    if (!radioOn_) return;
    esp_now_deinit();
    WiFi.mode(WIFI_OFF);
    radioOn_ = false;
  }

  void radioSend(const Packet& p) override {
    if (radioOn_) esp_now_send(kBroadcast, reinterpret_cast<const uint8_t*>(&p), sizeof(p));
  }

  bool updateStart() override {
    uint8_t mac[6];
    macAddress(mac);
    snprintf(ssid_, sizeof(ssid_), "Lumi-%02X%02X", mac[4], mac[5]);
    snprintf(pass_, sizeof(pass_), "%08lu", (unsigned long)(esp_random() % 100000000UL));
    WiFi.mode(WIFI_AP);
    if (!WiFi.softAP(ssid_, pass_)) return false;
    snprintf(addr_, sizeof(addr_), "%s", WiFi.softAPIP().toString().c_str());

    server_ = new WebServer(80);
    server_->on("/", HTTP_GET, [this]() { server_->send_P(200, "text/html", kUpdatePage); });
    server_->on(
        "/update", HTTP_POST,
        [this]() {
          const bool ok = !Update.hasError() && progress_ == 100;
          server_->send(200, "text/plain", ok ? "Installed! Lumi is restarting..." : "Update failed :(");
          if (ok) {
            delay(500);
            ESP.restart();
          }
        },
        [this]() { onUpload(); });
    server_->begin();
    progress_ = -1;
    return true;
  }

  void updateStop() override {
    if (!server_) return;
    server_->stop();
    delete server_;
    server_ = nullptr;
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_OFF);
  }

  const char* updateSsid() override { return ssid_; }
  const char* updatePassword() override { return pass_; }
  const char* updateAddress() override { return addr_; }
  int updateProgress() override { return progress_; }

  void poll() {
    if (server_) server_->handleClient();
  }

 private:
  void onUpload() {
    HTTPUpload& up = server_->upload();
    if (up.status == UPLOAD_FILE_START) {
      expected_ = server_->arg("size").toInt();
      progress_ = Update.begin(expected_ > 0 ? expected_ : UPDATE_SIZE_UNKNOWN) ? 0 : -1;
    } else if (up.status == UPLOAD_FILE_WRITE && progress_ >= 0) {
      if (Update.write(up.buf, up.currentSize) != up.currentSize) {
        progress_ = -1;
      } else if (expected_ > 0) {
        progress_ = (int)(up.totalSize * 99ULL / expected_);
      }
    } else if (up.status == UPLOAD_FILE_END) {
      progress_ = (progress_ >= 0 && Update.end(true)) ? 100 : -1;
    } else if (up.status == UPLOAD_FILE_ABORTED) {
      Update.abort();
      progress_ = -1;
    }
  }

  bool radioOn_ = false;
  WebServer* server_ = nullptr;
  char ssid_[16] = "";
  char pass_[12] = "";
  char addr_[16] = "";
  int progress_ = -1;
  size_t expected_ = 0;
};

static DeviceHal hal;
static lumi::App app(hal, reinterpret_cast<lumi::MoodState*>(gMoodRaw));

// ---------------------------------------------------------------------------

static void remap(const AccelSample& s, float& x, float& y, float& z) {
  const float v[3] = {s.x, s.y, s.z};
  x = LUMI_IMU_SCREEN_X_SIGN * v[LUMI_IMU_SCREEN_X_AXIS];
  y = LUMI_IMU_SCREEN_Y_SIGN * v[LUMI_IMU_SCREEN_Y_AXIS];
  z = LUMI_IMU_SCREEN_Z_SIGN * v[LUMI_IMU_SCREEN_Z_AXIS];
}

[[noreturn]] static void deepSleep() {
  Serial.println("lumi: going to sleep");
  Serial.flush();
  hal.radioStop();
  hal.updateStop();
  if (displayOk) display.power(false);
  if (imuOk) imu.enterMotionWake(LUMI_WAKE_THRESHOLD, LUMI_WAKE_DURATION_MS);
  time(&gSleptAt);
#if defined(CONFIG_IDF_TARGET_ESP32S3)
  // The S3 wakes through the RTC controller (EXT1); hold INT low if the IMU
  // is missing so a floating pin can't wake it.
  rtc_gpio_pullup_dis((gpio_num_t)LUMI_PIN_IMU_INT);
  rtc_gpio_pulldown_en((gpio_num_t)LUMI_PIN_IMU_INT);
  esp_sleep_enable_ext1_wakeup(1ULL << LUMI_PIN_IMU_INT, ESP_EXT1_WAKEUP_ANY_HIGH);
#else
  esp_deep_sleep_enable_gpio_wakeup(1ULL << LUMI_PIN_IMU_INT, ESP_GPIO_WAKEUP_GPIO_HIGH);
#endif
  esp_deep_sleep_start();
  for (;;) {
  }
}

static void serialCommands() {
  static char line[48];
  static size_t len = 0;
  while (Serial.available()) {
    const char c = (char)Serial.read();
    if (c != '\n' && c != '\r') {
      if (len < sizeof(line) - 1) line[len++] = c;
      continue;
    }
    line[len] = 0;
    len = 0;
    if (!line[0]) continue;
    if (strcmp(line, "i") == 0) {
      const lumi::GestureDetector& g = app.gestures();
      Serial.printf("accel x=%+.2f y=%+.2f z=%+.2f  gravity x=%+.2f y=%+.2f z=%+.2f  %s  imu=0x%02X\n",
                    lastX, lastY, lastZ, g.gx(), g.gy(), g.gz(),
                    lumi::GestureDetector::name(g.orientation()), imu.whoAmI());
    } else if (strcmp(line, "a") == 0) {
      for (int i = 0; i < lumi::animationCount(); ++i)
        Serial.printf("%2d %-24s %s\n", i, lumi::animation(i).name,
                      lumi::triggerName(lumi::animation(i).trigger));
    } else if (strncmp(line, "p ", 2) == 0) {
      const int idx = lumi::findAnimation(line + 2);
      if (idx >= 0) app.debugPlay(idx);
      else Serial.println("unknown animation");
    } else if (strcmp(line, "m") == 0) {
      const lumi::MoodState& s = app.mood().state();
      Serial.printf("happy=%.1f energy=%.1f pats=%lu games=%lu/%lu mode=%s\n", s.happy, s.energy,
                    (unsigned long)s.pats, (unsigned long)s.gamesWon, (unsigned long)s.gamesPlayed,
                    lumi::App::modeName(app.mode()));
    } else if (strcmp(line, "b") == 0) {
      const uint16_t mv = hal.batteryMv();
      Serial.printf("battery %u mV (%u%%)\n", mv, lumi::batteryPercent(mv));
    } else if (strcmp(line, "s") == 0) {
      deepSleep();
    } else {
      Serial.println("commands: i (imu)  a (list animations)  p <name> (play)  m (mood)  b (battery)  s (sleep)");
    }
  }
}

void setup() {
  setCpuFrequencyMhz(LUMI_CPU_MHZ);
  Serial.begin(115200);
  rxQueue = xQueueCreate(16, sizeof(Packet));

  Wire.begin(LUMI_PIN_SDA, LUMI_PIN_SCL);
  Wire.setClock(LUMI_I2C_HZ);
  analogReadResolution(12);
#if LUMI_PIN_USB_SENSE >= 0
  pinMode(LUMI_PIN_USB_SENSE, INPUT);
#endif

  displayOk = display.begin(Wire, LUMI_OLED_ADDR, LUMI_OLED_FLIP);
  imuOk = imu.begin(Wire, LUMI_IMU_ADDR);
  if (!displayOk) Serial.println("lumi: SSD1306 not found - check SDA/SCL and address");
  if (!imuOk) Serial.println("lumi: IMU not found - check wiring (AD0 low = 0x68)");
  else Serial.printf("lumi: IMU WHO_AM_I=0x%02X\n", imu.whoAmI());

  lumi::WakeReason why = lumi::WakeReason::PowerOn;
  uint32_t slept = 0;
  const esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  if (cause == ESP_SLEEP_WAKEUP_GPIO || cause == ESP_SLEEP_WAKEUP_EXT1) {
    why = lumi::WakeReason::Motion;
    const time_t now = time(nullptr);
    slept = now > gSleptAt ? (uint32_t)(now - gSleptAt) : 0;
    ++gWakeCount;
  }
  Serial.printf("lumi: wake=%s slept=%lus wakes=%lu\n", why == lumi::WakeReason::Motion ? "motion" : "power-on",
                (unsigned long)slept, (unsigned long)gWakeCount);
  memset(shown, 0xAA, sizeof(shown));  // force the first frame out
  app.begin(why, slept);
}

void loop() {
  static AccelSample samples[64];
  static uint32_t lastFrame = 0;
  const uint32_t now = millis();

  Packet p;
  while (xQueueReceive(rxQueue, &p, 0) == pdTRUE) app.onPacket(p);

  if (imuOk) {
    const int n = imu.read(samples, 64, now);
    for (int i = 0; i < n; ++i) {
      remap(samples[i], lastX, lastY, lastZ);
      app.onAccel(lastX, lastY, lastZ, samples[i].t);
    }
  }

  hal.poll();
  serialCommands();

  if (now - lastFrame >= LUMI_FRAME_MS) {
    lastFrame = now;
    app.update();
    app.render(canvas);
    if (displayOk && memcmp(canvas.buf, shown, sizeof(shown)) != 0) {
      display.push(canvas.buf);
      memcpy(shown, canvas.buf, sizeof(shown));
    }
  }

  if (app.wantsSleep()) deepSleep();
  delay(1);
}
