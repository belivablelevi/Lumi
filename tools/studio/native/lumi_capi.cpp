#include "lumi_capi.h"

#include <stdio.h>
#include <string.h>

#include "animations.h"
#include "animator.h"
#include "app.h"
#include "face.h"
#include "genes.h"
#include "gfx.h"
#include "pack.h"

using namespace lumi;

namespace {

Genes toGenes(const uint8_t* b) {
  Genes g;
  for (int i = 0; i < kGeneCount; ++i) setGene(g, (GeneId)i, b[i]);
  return g;
}

void fromGenes(const Genes& g, uint8_t* b) {
  for (int i = 0; i < kGeneCount; ++i) b[i] = geneValue(g, (GeneId)i);
}

}  // namespace

struct LumiPlayer {
  Animator anim;
  Pack pack;
  Genes genes;
  bool hasGenes = false;
  uint32_t now = 0;
};

LUMI_API const char* lumi_version(void) { return kFirmwareVersion; }

LUMI_API int lumi_expr_count(void) { return (int)Expr::Count; }
LUMI_API const char* lumi_expr_name(int e) { return exprName((Expr)e); }
LUMI_API void lumi_expression(int e, uint8_t face[32]) {
  if (e < 0 || e >= (int)Expr::Count) e = 0;
  Pack::encodeFace(expression((Expr)e), face);
}

LUMI_API void lumi_render_face(const uint8_t face[32], const uint8_t* genes, uint32_t t, uint8_t out[1024]) {
  Face f;
  Canvas c;
  if (Pack::decodeFace(face, &f)) {
    if (genes) {
      const Genes g = toGenes(genes);
      if (genesValid(g)) f = personalize(f, g);
    }
    drawFace(c, f, t);
  }
  memcpy(out, c.buf, kBufferSize);
}

LUMI_API void lumi_render_expression(int e, const uint8_t* genes, uint32_t t, uint8_t out[1024]) {
  Canvas c;
  if (e >= 0 && e < (int)Expr::Count) {
    Face f = expression((Expr)e);
    if (genes) {
      const Genes g = toGenes(genes);
      if (genesValid(g)) f = personalize(f, g);
    }
    drawFace(c, f, t);
  }
  memcpy(out, c.buf, kBufferSize);
}

LUMI_API int lumi_gene_count(void) { return kGeneCount; }
LUMI_API const char* lumi_gene_name(int g) { return geneName((GeneId)g); }
LUMI_API int lumi_gene_options(int g) { return geneOptions((GeneId)g); }
LUMI_API const char* lumi_gene_option_name(int g, int o) { return geneOptionName((GeneId)g, o); }
LUMI_API int lumi_gene_weight(int g, int o) { return geneWeight((GeneId)g, o); }
LUMI_API void lumi_genes_from_seed(uint64_t seed, uint8_t genes[7]) { fromGenes(genesFromSeed(seed), genes); }
LUMI_API void lumi_name_from_seed(uint64_t seed, char* out, int size) { nameFromSeed(seed, out, size); }
LUMI_API uint32_t lumi_genes_code(const uint8_t genes[7]) { return genesCode(toGenes(genes)); }
LUMI_API uint32_t lumi_look_count(void) { return lookCount(); }
LUMI_API double lumi_genes_probability(const uint8_t genes[7]) { return genesProbability(toGenes(genes)); }
LUMI_API int lumi_genes_rarity(const uint8_t genes[7]) { return (int)rarityOf(toGenes(genes)); }
LUMI_API const char* lumi_rarity_name(int r) { return rarityName((Rarity)r); }

LUMI_API int lumi_trigger_count(void) { return (int)Trigger::Count; }
LUMI_API const char* lumi_trigger_name(int t) { return triggerName((Trigger)t); }
LUMI_API int lumi_builtin_anim_count(void) { return builtinAnimationCount(); }
LUMI_API const char* lumi_builtin_anim_name(int i) { return i < builtinAnimationCount() ? animation(i).name : ""; }
LUMI_API int lumi_builtin_anim_trigger(int i) { return i < builtinAnimationCount() ? (int)animation(i).trigger : -1; }

LUMI_API int lumi_pack_validate(const uint8_t* data, size_t len, char* err, int err_size) {
  static Pack pack;
  const Pack::Error e = pack.decode(data, len);
  if (err && err_size > 0) snprintf(err, err_size, "%s", Pack::errorName(e));
  return (int)e;
}

LUMI_API size_t lumi_pack_reencode(const uint8_t* data, size_t len, uint8_t* out, size_t cap) {
  static Pack pack;
  if (pack.decode(data, len) != Pack::Error::None) return 0;
  return pack.encode(out, cap);
}

LUMI_API LumiPlayer* lumi_player_new(uint32_t seed) {
  LumiPlayer* p = new LumiPlayer();
  p->anim.begin(0, seed ? seed : 1);
  p->anim.setIdleEnabled(false);
  return p;
}

LUMI_API void lumi_player_free(LumiPlayer* p) {
  if (!p) return;
  registerPack(1, nullptr);
  delete p;
}

LUMI_API int lumi_player_load_pack(LumiPlayer* p, const uint8_t* data, size_t len) {
  p->anim.stop();
  registerPack(1, nullptr);
  if (!data || !len) {
    p->pack.clear();
    return 0;
  }
  const Pack::Error e = p->pack.decode(data, len);
  if (e == Pack::Error::None) registerPack(1, &p->pack);
  return (int)e;
}

LUMI_API void lumi_player_set_genes(LumiPlayer* p, const uint8_t* genes) {
  p->hasGenes = genes != nullptr;
  if (genes) p->genes = toGenes(genes);
}

LUMI_API void lumi_player_set_base(LumiPlayer* p, int e) {
  if (e >= 0 && e < (int)Expr::Count) p->anim.setBase((Expr)e);
}

LUMI_API void lumi_player_set_idle(LumiPlayer* p, int enabled) { p->anim.setIdleEnabled(enabled != 0); }

LUMI_API int lumi_player_play(LumiPlayer* p, const char* name) {
  const int i = findAnimation(name);
  if (i >= 0) p->anim.playIndex(i);
  return i;
}

LUMI_API void lumi_player_stop(LumiPlayer* p) { p->anim.stop(); }
LUMI_API int lumi_player_busy(LumiPlayer* p) { return p->anim.busy() ? 1 : 0; }

LUMI_API void lumi_player_update(LumiPlayer* p, uint32_t t) {
  p->now = t;
  p->anim.update(t);
}

LUMI_API void lumi_player_render(LumiPlayer* p, uint8_t out[1024]) {
  Canvas c;
  Face f = p->anim.face();
  if (p->hasGenes && genesValid(p->genes)) f = personalize(f, p->genes);
  drawFace(c, f, p->now);
  memcpy(out, c.buf, kBufferSize);
}

LUMI_API int lumi_anim_count(void) { return animationCount(); }
LUMI_API const char* lumi_anim_name(int i) { return i >= 0 && i < animationCount() ? animation(i).name : ""; }
