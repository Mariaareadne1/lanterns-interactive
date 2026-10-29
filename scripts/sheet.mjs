// Contact sheet: node scripts/sheet.mjs out.png cols in1.png in2.png ... (crops via CROP=x,y,w,h)
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const [out, cols, ...inputs] = process.argv.slice(2);
const crop = process.env.CROP ? `crop=${process.env.CROP.split(',').join(':')},` : '';
const n = inputs.length;
const filter = inputs.map((_, i) => `[${i}:v]${crop}scale=720:-2[v${i}]`).join(';') + ';' + inputs.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${n}:layout=` + inputs.map((_, i) => `${(i % cols) ? Array.from({ length: i % cols }, () => 'w0').join('+') : '0'}_${Math.floor(i / cols) ? Array.from({ length: Math.floor(i / cols) }, () => 'h0').join('+') : '0'}`).join('|');
execFileSync(ffmpeg, ['-y', ...inputs.flatMap((f) => ['-i', f]), '-filter_complex', filter, '-frames:v', '1', out], { stdio: 'ignore' });
console.log(out);
