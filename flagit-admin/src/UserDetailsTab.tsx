import type { PredictionRow } from "./types"
import { Eye } from "lucide-react"

export default function UserDetailsTab({
  userEmail,
  rows,
  onViewRow
}: {
  userEmail: string
  rows: PredictionRow[]
  onViewRow: (r: PredictionRow | null) => void
}) {
  const filtered = rows.filter((r) => r.user === userEmail)

  return (
    <div className="p-6 space-y-4 text-sm text-slate-200">
      <h3 className="text-slate-300">
        Emails analyzed for: <span className="text-white">{userEmail}</span>
      </h3>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-slate-400 bg-slate-900/80">
              <th className="py-2 px-3">Sent By</th>
              <th className="py-2 px-3">Email Snippet</th>
              <th className="py-2 px-3">Result</th>
              <th className="py-2 px-3">Confidence</th>
              <th className="py-2 px-3">Timestamp</th>
              <th className="py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="border-t border-slate-800/80">
                <td className="py-3 px-3 text-white">{r.sender || "Unknown"}</td>
                <td className="py-3 px-3 max-w-xs truncate">{r.email_snippet}</td>
                <td className="py-3 px-3">
                  {r.result === "phishing" ? (
                    <span className="text-red-300">Phishing</span>
                  ) : (
                    <span className="text-emerald-300">Safe</span>
                  )}
                </td>
                <td className="py-3 px-3">{(r.confidence * 100).toFixed(2)}%</td>
                <td className="py-3 px-3">{r.timestamp}</td>
                <td className="py-3 px-3">
                  <button
                    className="p-2 hover:bg-slate-800 rounded-xl text-white"
                    onClick={() => onViewRow(r)}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  className="py-4 px-3 text-slate-400"
                  colSpan={6}
                >
                  No emails detected yet for this user.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
