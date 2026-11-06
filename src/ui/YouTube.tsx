import { useState } from 'preact/hooks';

interface Props {
  youtubeId: string;
  start?: number;
  end?: number;
  title: string;
}

/**
 * Click-to-load YouTube facade: nothing is requested from YouTube until the student presses
 * play, and the player then comes from the privacy-enhanced youtube-nocookie.com domain.
 */
export default function YouTube({ youtubeId, start = 0, end, title }: Props) {
  const [on, setOn] = useState(false);
  const params = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', hl: 'he', cc_lang_pref: 'he' });
  if (start) params.set('start', String(start));
  if (end) params.set('end', String(end));
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div class="yt">
      {on ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <button type="button" class="yt-facade" onClick={() => setOn(true)} aria-label={`הפעלת הסרטון: ${title}`}>
          <span class="yt-play" aria-hidden="true">
            ▶
          </span>
          <span class="yt-note">
            לחיצה טוענת את הסרטון מ-YouTube
            {start ? ` (מתחיל ב-${fmt(start)})` : ''}
          </span>
        </button>
      )}
    </div>
  );
}
