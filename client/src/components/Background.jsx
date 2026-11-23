// Nền chỉ là một lớp gradient màu chuyển động chậm. Không blur, không bong bóng, không filter nên máy yếu vẫn mượt.
export default function Background() {
  return <div className="bg" aria-hidden="true" />;
}
