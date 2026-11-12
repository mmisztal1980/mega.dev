import http from 'node:http';
http.createServer((q, s) => { let b=''; q.on('data', c => b+=c); q.on('end', () => { console.log('REPLY', q.url, b); s.end('ok'); }); }).listen(8799);
