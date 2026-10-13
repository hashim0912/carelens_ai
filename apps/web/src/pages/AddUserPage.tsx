import { UserPlus } from "lucide-react";
import { useState } from "react";
import { apiPaths } from "@carelens/shared";
import { apiFetch } from "../lib/api";
import { Button, Card, CardBody, CardHeader, Field, inputClass } from "../components/ui";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "DOCTOR", label: "Doctor" },
  { value: "STAFF", label: "Staff" },
];

export function AddUserPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await apiFetch(apiPaths.users, {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setSuccess(true);
      setName("");
      setEmail("");
      setPassword("");
      setRole("STAFF");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-lg space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-navy">Add User</h1>
        <p className="mt-1 text-sm text-muted">Create a new clinician or staff account.</p>
      </header>

      <Card>
        <CardHeader icon={<UserPlus className="h-4 w-4" />} title="Account details" />
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field id="add-user-name" label="Full name" required>
              <input
                id="add-user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field id="add-user-email" label="Email" required>
              <input
                id="add-user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field id="add-user-password" label="Temporary password" required helper="Minimum 8 characters.">
              <input
                id="add-user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={inputClass}
              />
            </Field>
            <Field id="add-user-role" label="Role" required>
              <select
                id="add-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={inputClass}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            {error ? (
              <p role="alert" className="rounded-lg border border-critical/30 bg-[#fdeef1] px-3 py-2 text-sm text-critical">
                {error}
              </p>
            ) : null}
            {success ? (
              <p role="status" className="rounded-lg border border-success/30 bg-[#e6f6f4] px-3 py-2 text-sm text-success">
                User created successfully.
              </p>
            ) : null}

            <Button type="submit" variant="primary" loading={busy} className="w-full">
              {busy ? "Creating…" : "Create user"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </section>
  );
}