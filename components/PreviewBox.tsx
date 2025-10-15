"use client";

export default function PreviewBox() {
  return (
    <div className="w-full overflow-hidden rounded-md border bg-white">
      <iframe
        src="/dev/quick-generate"
        className="w-full"
        style={{ height: 560, border: "0" }}
        title="Preview Sandbox"
      />
    </div>
  );
}
