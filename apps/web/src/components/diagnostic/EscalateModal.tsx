import { Send } from "lucide-react";
import { useState, type FC, type FormEvent } from "react";
import { Button, Dialog, Field, inputClass } from "../ui";

export interface EscalatePayload {
  reason: string;
  urgency: "low" | "medium" | "high" | "critical";
  notes: string;
}

export interface EscalateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: EscalatePayload) => void;
}

export const EscalateModal: FC<EscalateModalProps> = ({ open, onClose, onSubmit }) => {
  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState<EscalatePayload["urgency"]>("medium");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onSubmit({ reason: reason.trim(), urgency, notes: notes.trim() });
    setReason("");
    setUrgency("medium");
    setNotes("");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Escalate for senior over-read"
      description="Queue this study for review by a senior radiologist."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field id="escalate-reason" label="Reason" required>
          <input
            id="escalate-reason"
            name="reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Uncertain consolidation, need expert review"
            className={inputClass}
          />
        </Field>
        <Field id="escalate-urgency" label="Urgency">
          <select
            id="escalate-urgency"
            name="urgency"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as EscalatePayload["urgency"])}
            className={inputClass}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
        <Field id="escalate-notes" label="Notes" hint="optional">
          <textarea
            id="escalate-notes"
            name="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional context for the reviewing radiologist"
            className={inputClass}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            <Send className="h-4 w-4" />
            Submit escalation
          </Button>
        </div>
      </form>
    </Dialog>
  );
};