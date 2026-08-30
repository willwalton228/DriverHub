import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { exportToExcel, type ExcelColumn } from "@/lib/excelExport";
import { useToast } from "@/hooks/use-toast";

interface ExcelDownloadButtonProps<T extends Record<string, unknown>> {
  data: T[];
  columns: ExcelColumn[];
  filename: string;
  label?: string;
}

export function ExcelDownloadButton<T extends Record<string, unknown>>({
  data,
  columns,
  filename,
  label = "Download Excel",
}: ExcelDownloadButtonProps<T>) {
  const { toast } = useToast();

  const handleDownload = () => {
    if (data.length === 0) {
      toast({
        title: "No Data",
        description: "There is no data to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      const exportedFilename = exportToExcel(data, columns, filename);
      toast({
        title: "Download Started",
        description: `Exporting ${data.length} records to ${exportedFilename}`,
      });
    } catch {
      toast({
        title: "Export Failed",
        description: "There was an error exporting the data.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download-excel">
      <Download className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
}
