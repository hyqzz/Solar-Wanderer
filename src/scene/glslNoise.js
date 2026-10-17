// 共享 GLSL 噪声原语。
//
// 为什么单独成文件：同一个 `fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453)`
// 此前在 scene/ 下的 4 个文件里各写了一份（planetMaterial 两处、atmosphere、
// terrain、sun），注释里也明说过"不该复制"。而它还有一个真实问题：
//
// **sin 哈希在 mediump GPU 上会退化**——低精度下 sin 的自变量很快失去有效位，
// 噪声会退化成可见的重复图案（移动端 GPU 常见）。这里改用不含 sin 的整数式
// 哈希（Dave Hoskins 的经典式），fract/dot 在 mediump 下也稳定得多。

export const HASH_GLSL = /* glsl */ `
  // 三维点 → [0,1) 的确定性哈希。无 sin，mediump 下稳定。
  float glslHash31(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`;
