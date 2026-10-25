"use client";

import { TriangleAlert } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <span
            className={
              destructive
                ? "grid size-7 place-items-center rounded-full bg-danger-soft text-danger"
                : "grid size-7 place-items-center rounded-full bg-warning-soft text-warning"
            }
          >
            <TriangleAlert className="size-4" />
          </span>
          {title}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t("Cancel")}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel ?? t("Confirm")}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </Modal>
  );
}
