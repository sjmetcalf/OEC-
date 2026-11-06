# OEC Practice

Unofficial Outdoor Emergency Care study tool. Drill by topic, take a short exam, and review the questions you missed. It is not the National Ski Patrol exam and it does not certify anyone.

The site is a React app on Cloudflare Workers, served at [oec.fyi](https://oec.fyi).

```bash
npm install
npm run dev
```

Deploy with `npm run deploy` after `cf auth login`. The Worker name is `oec`, and `cloudflare.config.ts` attaches the `oec.fyi` custom domain.
