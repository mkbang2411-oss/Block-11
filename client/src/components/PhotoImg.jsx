// <img> responsive theo yêu cầu bài tập: srcset (chiều rộng thực của từng file), sizes, width/height, loading, alt.
export default function PhotoImg({ photo, sizes, eager, className, style, imgRef, ...rest }) {
  const v = photo.variants;
  const src = v.find((x) => x.width >= 960) || v[v.length - 1];
  return (
    <img
      ref={imgRef} className={className} style={style} draggable={false}
      src={src.url} srcSet={v.map((x) => `${x.url} ${x.width}w`).join(', ')} sizes={sizes}
      width={src.width} height={src.height} loading={eager ? 'eager' : 'lazy'} decoding="async" alt={photo.alt} {...rest}
    />
  );
}
