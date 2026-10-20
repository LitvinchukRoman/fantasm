/** SwiftShader, llvmpipe тощо: WebGL рахується на CPU, кожен кадр сцени коштує секунди. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
}
