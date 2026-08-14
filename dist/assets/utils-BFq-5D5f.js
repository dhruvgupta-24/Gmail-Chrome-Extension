function f(e,n){if(!e)return n?`At ${n}`:"Date not specified";try{const[o,s,c]=e.split("-").map(Number);if(!o||!s||!c)return e;const i=new Date(o,s-1,c),u=new Date;u.setHours(0,0,0,0);const d=new Date(i);d.setHours(0,0,0,0);const t=Math.round((d.getTime()-u.getTime())/(1e3*60*60*24)),r=`${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][s-1]} ${c}, ${o}`;let a="";return t===0?a="Today":t===1?a="Tomorrow":t===-1?a="Yesterday":t>1&&t<7&&(a=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][i.getDay()]),a?n?`${a} (${r}) at ${n}`:`${a} (${r})`:n?`${r} at ${n}`:r}catch{return e}}function g(e,n){return`https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(n||e)}`}function m(e){return e.replace(/\r\n/g,`
`).replace(/\r/g,`
`).replace(/[ \t]+/g," ").replace(/\n\s*\n/g,`

`).trim()}export{m as c,f,g};
