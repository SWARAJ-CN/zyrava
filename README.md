# zyrava

## Production music search

`vercel.json` pins server functions to Mumbai (`bom1`). The upstream music
catalogue varies by request origin: the US deployment returned only unrelated
recordings for `La Bouche Be My Lover`, while a local Indian request returned
La Bouche. Keep production catalogue requests in the intended market.

Typed searches prefer JioSaavn directly, then consult up to two `MUSIC_API`
mirrors when the match is weak or the direct service fails. Browsing retains
the configured mirror order. Artist/title matching and recording-version
penalties rank originals ahead of unrequested covers and mixes.

Redeploy the web project after changing its region configuration. Verify
`/api/music/search?q=La%20Bouche%20Be%20My%20Lover&limit=10` on the deployed URL:
the first result should have artist `La Bouche`, and the `x-vercel-id` header
should show `bom1` as the function region rather than `iad1`. This check is
necessary because local tests cannot verify a deployed function's catalogue.

Run search regressions with `node --test tests/search-regressions.test.mjs`.
