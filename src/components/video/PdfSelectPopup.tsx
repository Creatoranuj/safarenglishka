import { memo } from "react";
import { FileText, ExternalLink, X } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from "../ui/dialog";

export interface PdfItem {
  id: string;
  file_name: string;
  file_url: string;
  file_size?: number | null;
}

interface PdfSelectPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfs: PdfItem[];
  onSelect: (pdf: PdfItem) => void;
}

const formatSize = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const PdfSelectPopup = memo(({ open, onOpenChange, pdfs, onSelect }: PdfSelectPopupProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Select PDF
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {pdfs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No PDFs available</p>
          ) : (
            pdfs.map((pdf) => (
              <button
                key={pdf.id}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                onClick={() => { onSelect(pdf); onOpenChange(false); }}
              >
                <div className="p-2 rounded-lg bg-orange-100 text-orange-600 shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{pdf.file_name}</p>
                  {pdf.file_size && (
                    <p className="text-xs text-muted-foreground">{formatSize(pdf.file_size)}</p>
                  )}
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

PdfSelectPopup.displayName = "PdfSelectPopup";

export default PdfSelectPopup;
