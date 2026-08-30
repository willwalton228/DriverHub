import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import DashboardModal from "@uppy/react/dashboard-modal";
import AwsS3 from "@uppy/aws-s3";
import Webcam from "@uppy/webcam";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import "@uppy/core/css/style.css";
import "@uppy/dashboard/css/style.css";
import "@uppy/webcam/css/style.css";

interface UploadFile {
  name: string;
  type: string;
  size: number;
  data: Blob | File;
}

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: (file?: UploadFile) => Promise<{
    method: "PUT";
    url: string;
    headers?: Record<string, string>;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  onError?: (errorMessage: string) => void;
  buttonClassName?: string;
  buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  children: ReactNode;
  enableCamera?: boolean;
  allowedFileTypes?: string[];
  testId?: string;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760,
  onGetUploadParameters,
  onComplete,
  onError,
  buttonClassName,
  buttonVariant = "default",
  children,
  enableCamera = true,
  allowedFileTypes = ['image/*'],
  testId = "button-upload-photo",
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const { toast } = useToast();
  
  const [uppy] = useState(() => {
    const instance = new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
        allowedFileTypes,
      },
      autoProceed: false,
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: async (file: any) => {
          const uploadFile: UploadFile = {
            name: file.name || 'upload',
            type: file.type || 'application/octet-stream',
            size: file.size || 0,
            data: file.data,
          };
          const params = await onGetUploadParameters(uploadFile);
          // Always include Content-Type header for GCS compatibility
          return {
            ...params,
            headers: {
              'Content-Type': uploadFile.type,
              ...params.headers,
            },
          };
        },
      });

    if (enableCamera) {
      instance.use(Webcam, {
        modes: ['picture'],
        mirror: true,
        showRecordingLength: false,
        preferredVideoMimeType: null,
        preferredImageMimeType: 'image/jpeg',
      });
    }

    return instance;
  });

  useEffect(() => {
    const getUserFriendlyError = (rawError: unknown): string => {
      const errorStr = typeof rawError === 'string' ? rawError : String(rawError || '');
      
      if (errorStr.includes('500') || errorStr.includes('Internal Server Error')) {
        return "There was a problem saving your file. Please try again in a moment, or try a smaller file size.";
      }
      if (errorStr.includes('403') || errorStr.includes('Forbidden')) {
        return "You don't have permission to upload files. Please contact your administrator.";
      }
      if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
        return "Your session may have expired. Please refresh the page and try again.";
      }
      if (errorStr.includes('413') || errorStr.includes('too large')) {
        return "This file is too large. Please try a smaller file (under 10MB).";
      }
      if (errorStr.includes('network') || errorStr.includes('Network')) {
        return "Network error. Please check your internet connection and try again.";
      }
      if (errorStr.includes('timeout') || errorStr.includes('Timeout')) {
        return "The upload took too long. Please try again with a smaller file.";
      }
      
      return "Unable to upload file. Please try a different image or try again later.";
    };

    const handleComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
      const failedCount = result.failed?.length || 0;
      const successCount = result.successful?.length || 0;
      
      if (failedCount > 0) {
        const rawError = result.failed?.[0]?.error;
        const userMessage = getUserFriendlyError(rawError);
        toast({
          title: "Upload Failed",
          description: userMessage,
          variant: "destructive",
        });
        onError?.(userMessage);
      } else if (successCount > 0) {
        onComplete?.(result);
        setShowModal(false);
      }
    };

    const handleError = (error: Error) => {
      console.error("Upload error:", error);
      const userMessage = getUserFriendlyError(error.message);
      toast({
        title: "Upload Failed",
        description: userMessage,
        variant: "destructive",
      });
      onError?.(userMessage);
    };

    const handleRestrictionFailed = (_file: unknown, error: Error) => {
      let message = "This file type or size is not allowed.";
      if (error.message?.includes('size')) {
        message = "This file is too large. Please choose a file under 10MB.";
      } else if (error.message?.includes('type')) {
        message = "This file type is not supported. Please use JPG, PNG, or other image formats.";
      }
      toast({
        title: "File Not Allowed",
        description: message,
        variant: "destructive",
      });
    };

    uppy.on("complete", handleComplete);
    uppy.on("error", handleError);
    uppy.on("restriction-failed", handleRestrictionFailed);

    return () => {
      uppy.off("complete", handleComplete);
      uppy.off("error", handleError);
      uppy.off("restriction-failed", handleRestrictionFailed);
    };
  }, [uppy, onComplete, onError, toast]);

  return (
    <div>
      <Button 
        onClick={() => setShowModal(true)} 
        className={buttonClassName}
        variant={buttonVariant}
        type="button"
        data-testid={testId}
      >
        {children}
      </Button>

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
        plugins={enableCamera ? ['Webcam'] : []}
        showNativePhotoCameraButton={true}
        showNativeVideoCameraButton={false}
      />
    </div>
  );
}
