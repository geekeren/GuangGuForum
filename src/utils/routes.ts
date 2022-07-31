import { Buffer } from 'buffer';

export const base64Encode = (content: string) => {
  return Buffer.from(content, 'utf-8').toString('base64');
}

export const base64Decode = (content: string) => {
  return Buffer.from(content, 'utf-8').toString('base64');
}
