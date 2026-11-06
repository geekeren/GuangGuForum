declare module '*.svg' {
  const url: string;
  export default url;
}
declare module '*.svg?raw' {
  const source: string;
  export default source;
}
declare module '*.scss' {
  const styles: Record<string, string>;
  export default styles;
}
declare module '*.module.scss' {
  const styles: Record<string, string>;
  export default styles;
}
