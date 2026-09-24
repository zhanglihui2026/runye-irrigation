// Pure numeric ABI v1. Units: length/head m, flow m3/h, diameter mm.
// Keep double precision; do not enable fast-math. Input normalization lives in JS.
#include <cmath>
#include <emscripten/emscripten.h>

extern "C" {
EMSCRIPTEN_KEEPALIVE int ry_abi_version() { return 1; }
EMSCRIPTEN_KEEPALIVE double ry_inner(double od, double sdr) {
  return sdr == 0 ? od : od * (1.0 - 2.0 / sdr);
}
EMSCRIPTEN_KEEPALIVE double ry_hazen(double length, double flow, double diameter, double c) {
  if (diameter <= 0 || flow <= 0) return 0;
  return 1.113e9 * length * std::pow(flow, 1.852)
    / (std::pow(c, 1.852) * std::pow(diameter, 4.87));
}
EMSCRIPTEN_KEEPALIVE double ry_velocity(double flow, double diameter) {
  if (flow <= 0 || diameter <= 0) return 0;
  const double metres = diameter / 1000.0;
  return flow / 3600.0 / (3.14159265358979323846 * metres * metres / 4.0);
}
EMSCRIPTEN_KEEPALIVE double ry_local(double velocity, double zeta) {
  if (velocity <= 0 || zeta <= 0) return 0;
  return zeta * velocity * velocity / 19.62;
}
EMSCRIPTEN_KEEPALIVE double ry_christiansen(double outlets) {
  if (outlets <= 1) return 1;
  const double m = 1.852;
  return 1.0 / (m + 1.0) + 1.0 / (2.0 * outlets)
    + std::sqrt(m - 1.0) / (6.0 * outlets * outlets);
}
// Pump head (m): static lift + summed friction/local losses + margin head,
// all multiplied by a safety factor. Mirrors index.html computeThreeLevel:
//   H = (提升 + 地形 + 入口压力×10.2 − 已有压力×10.2 + 主管损失 + 支管损失
//       + 过滤阀门损失 + 富余) × 1.10
// staticM = 提升+地形+入口压力折米−已有压力折米 ; lossM = 主管+支管+过滤阀门损失合计.
EMSCRIPTEN_KEEPALIVE double ry_head(double staticM, double lossM, double marginM, double safety) {
  if (safety <= 0) return 0;
  return (staticM + lossM + marginM) * safety;
}
// Pump shaft power (kW): P = ρ·g·Q·H / η, with Q in m³/h and the constant
// 2.725 = 1000·9.81/3600 (ρ=1000, g=9.81, hour→second, W→kW). η is efficiency
// as a decimal. Zero when flow/head/efficiency is non-positive.
EMSCRIPTEN_KEEPALIVE double ry_power(double flow, double head, double eta) {
  if (flow <= 0 || head <= 0 || eta <= 0) return 0;
  return 2.725 * flow * head / eta / 1000.0;
}
}
