declare module 'pngjs' {
  export type PngLikeInput = Readonly<{
    width: number
    height: number
    data: Buffer
  }>

  export class PNG {
    width: number
    height: number
    data: Buffer

    constructor(options: Readonly<{ width: number; height: number }>)

    static readonly sync: Readonly<{
      read(input: Buffer): PNG
      write(input: PngLikeInput | PNG): Buffer
    }>
  }
}
