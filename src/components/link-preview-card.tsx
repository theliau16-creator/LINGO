import { useQuery } from "@tanstack/react-query";
import { fetchLinkPreview } from "@/lib/links.functions";
import { extractFirstUrl } from "@/lib/links";

/** Open Graph card rendered under a message containing a link. */
export function LinkPreviewCard({ text }: { text: string }) {
  const url = extractFirstUrl(text);

  const preview = useQuery({
    queryKey: ["link-preview", url],
    enabled: Boolean(url),
    retry: false,
    staleTime: 24 * 3600_000,
    queryFn: () => fetchLinkPreview({ data: { url: url! } }),
  });

  if (!url || preview.isError || !preview.data) return null;
  const { title, description, image_url, site_name } = preview.data;
  if (!title && !description) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="glass mt-1 block max-w-[80%] overflow-hidden rounded-2xl"
    >
      {image_url ? (
        <img
          src={image_url}
          alt=""
          loading="lazy"
          className="h-28 w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <div className="px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{site_name}</p>
        {title ? <p className="line-clamp-2 text-[13px] font-semibold">{title}</p> : null}
        {description ? (
          <p className="line-clamp-2 text-[12px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </a>
  );
}
