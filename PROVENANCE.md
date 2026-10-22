# Raster provenance

Every image the site ships, where it came from, and what is still unknown.

| File | Origin | How it was made | Rights |
| --- | --- | --- | --- |
| `public/img/gator-chomp.webp` | Pre-existing: shipped with the project before 21 Oct 2026 (listed in `metacrok-handoff.md` as one of "three poses in public/img/"). | Unknown. No generation prompt or source is recorded. | Unconfirmed. Ask the owner before any commercial use. |
| `public/img/gator-peek.webp` | Pre-existing, same as above. | Unknown. | Unconfirmed. |
| `public/img/gator-sit.webp` | Pre-existing, same as above. | Unknown. | Unconfirmed. |
| `public/img/gator-hero.webp` | Derived from `gator-chomp.webp` on 22 Oct 2026 for the landing hero. | The baked-in dark ground shadow was removed by clearing dark pixels in the bottom 22% of the alpha channel: `ffmpeg -i public/img/gator-chomp.webp -vf "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(Y,0.78*H)*lt(0.299*r(X,Y)+0.587*g(X,Y)+0.114*b(X,Y),85),0,alpha(X,Y))'" -c:v libwebp -q:v 90 public/img/gator-hero.webp` | Same as its source. |

Instagram and Meta Ad Library images shown in the app are not shipped: they load from Instagram's and Facebook's CDNs per run, belong to their owners, and their signed links expire after some days.
