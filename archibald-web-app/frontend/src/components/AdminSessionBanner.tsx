import { useAdminSessionCheck } from "../hooks/useAdminSessionCheck";

/**
 * Banner shown to agent when admin is working on their account
 */
export function AdminSessionBanner() {
  const { adminActive, adminName } = useAdminSessionCheck();

  if (!adminActive) {
    return null;
  }

  return (
    <div className="bg-yellow-500 text-black px-4 py-2 flex items-center space-x-2 shadow-md">
      <span className="text-xl">ℹ️</span>
      <span className="flex-1">
        <strong>{adminName}</strong> è connesso al tuo account. I tuoi dati
        potrebbero cambiare.
        <span className="ml-2 text-sm opacity-75">
          💡 Evita di modificare ordini fino a conferma.
        </span>
      </span>
    </div>
  );
}
