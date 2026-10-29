// C interface to Lumi's portable core, for Lumi Studio (Python ctypes).
//
// Faces cross the boundary in the emotion-pack face format (32 bytes, see
// Pack::encodeFace) and genes as 7 bytes in Genes field order, so the app and
// the firmware share one definition of both.
#pragma once
#include <stddef.h>
#include <stdint.h>

#if defined(_WIN32)
#define LUMI_API extern "C" __declspec(dllexport)
#else
#define LUMI_API extern "C" __attribute__((visibility("default")))
#endif

LUMI_API const char* lumi_version(void);

// Built-in expressions.
LUMI_API int lumi_expr_count(void);
LUMI_API const char* lumi_expr_name(int expr);
LUMI_API void lumi_expression(int expr, uint8_t face[32]);

// Renders a face (optionally with a unit's genes applied) at time `t_ms`.
// `genes` may be NULL. `out` receives the SSD1306 page buffer (1024 bytes).
LUMI_API void lumi_render_face(const uint8_t face[32], const uint8_t* genes, uint32_t t_ms, uint8_t out[1024]);
// Renders a built-in expression exactly as the firmware does (no 32-byte quantization).
LUMI_API void lumi_render_expression(int expr, const uint8_t* genes, uint32_t t_ms, uint8_t out[1024]);

// Genes.
LUMI_API int lumi_gene_count(void);
LUMI_API const char* lumi_gene_name(int gene);
LUMI_API int lumi_gene_options(int gene);
LUMI_API const char* lumi_gene_option_name(int gene, int option);
LUMI_API int lumi_gene_weight(int gene, int option);
LUMI_API void lumi_genes_from_seed(uint64_t seed, uint8_t genes[7]);
LUMI_API void lumi_name_from_seed(uint64_t seed, char* out, int size);
LUMI_API uint32_t lumi_genes_code(const uint8_t genes[7]);
LUMI_API uint32_t lumi_look_count(void);
LUMI_API double lumi_genes_probability(const uint8_t genes[7]);
LUMI_API int lumi_genes_rarity(const uint8_t genes[7]);
LUMI_API const char* lumi_rarity_name(int rarity);

// Triggers and built-in animations.
LUMI_API int lumi_trigger_count(void);
LUMI_API const char* lumi_trigger_name(int trigger);
LUMI_API int lumi_builtin_anim_count(void);
LUMI_API const char* lumi_builtin_anim_name(int index);
LUMI_API int lumi_builtin_anim_trigger(int index);

// Packs: returns 0 if `data` is a valid pack, else an error code with a
// message in `err`. `lumi_pack_reencode` decodes and re-encodes (for tests).
LUMI_API int lumi_pack_validate(const uint8_t* data, size_t len, char* err, int err_size);
LUMI_API size_t lumi_pack_reencode(const uint8_t* data, size_t len, uint8_t* out, size_t cap);

// Animation player: the firmware's Animator, with blink, breathing and motion.
typedef struct LumiPlayer LumiPlayer;
LUMI_API LumiPlayer* lumi_player_new(uint32_t seed);
LUMI_API void lumi_player_free(LumiPlayer* p);
LUMI_API int lumi_player_load_pack(LumiPlayer* p, const uint8_t* data, size_t len);  // 0 = ok
LUMI_API void lumi_player_set_genes(LumiPlayer* p, const uint8_t* genes);           // NULL = none
LUMI_API void lumi_player_set_base(LumiPlayer* p, int expr);
LUMI_API void lumi_player_set_idle(LumiPlayer* p, int enabled);
LUMI_API int lumi_player_play(LumiPlayer* p, const char* name);  // animation index or -1
LUMI_API void lumi_player_stop(LumiPlayer* p);
LUMI_API int lumi_player_busy(LumiPlayer* p);
LUMI_API void lumi_player_update(LumiPlayer* p, uint32_t t_ms);
LUMI_API void lumi_player_render(LumiPlayer* p, uint8_t out[1024]);
LUMI_API int lumi_anim_count(void);  // built-ins + loaded pack
LUMI_API const char* lumi_anim_name(int index);
