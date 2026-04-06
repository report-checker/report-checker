import { PdfPreview, type PreviewHighlight } from "@/components/pdf-preview";

type PreviewPanelProps = {
  activeFile: File | null;
  highlight: PreviewHighlight | null;
};

export function PreviewPanel({ activeFile, highlight }: PreviewPanelProps) {
  return (
    <section className="h-full overflow-hidden">
      <PdfPreview file={activeFile} highlight={highlight} />
    </section>
  );
}
