"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";
import { AuthBlockType } from "@/types/landing-block";

interface Props {
  block: AuthBlockType;
  token?: string;
  onSwitchLogin: () => void;
  onActionComplete?: (msg: string) => void;
}

function ResetPasswordContent({
  block,
  token,
  onSwitchLogin,
  onActionComplete,
}: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setMessage("Nevažeći reset link");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Šifre se ne poklapaju");
      return;
    }

    if (password.length < 6) {
      setMessage("Šifra mora imati najmanje 6 karaktera");
      return;
    }

    setIsLoading(true);

    try {
      // if (res.ok) {
      //   setMessage("Šifra je uspešno resetovana! Sada se možete prijaviti.");
      //   setPassword("");
      //   setConfirmPassword("");
      //   toast.success("Šifra je uspešno resetovana!");
      // } else {
      //   setMessage(data.error || "Došlo je do greške");
      // }

      // ✅ OBAVEŠTAVAMO AGENTA
      if (onActionComplete) {
        onActionComplete("Uspešno sam se ulogovao. Šta je sledeći korak?");
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : String(err));
      setMessage("Došlo je do greške pri resetovanju šifre");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
          <h2 className="text-2xl! font-bold text-center text-gray-900 mb-4">
            Nevažeći link
          </h2>
          <p className="text-gray-600 text-center">
            Reset link je nevažeći ili je istekao.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-right" />
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl! font-extrabold text-gray-900">
            Resetuj šifru
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Unesite novu šifru za vaš nalog
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Nova šifra
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Unesite novu šifru"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Potvrdite šifru
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Ponovite šifru"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="cursor-pointer group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-(--primary-color) hover:bg-(--primary-color)/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-(--primary-color) disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Resetovanje..." : "Resetuj šifru"}
            </button>
          </div>
        </form>
        <p className="mt-10 text-center text-sm/6 text-gray-400">
          Imate nalog?{" "}
          <button
            onClick={onSwitchLogin}
            className="font-semibold text-(--secondary-color) hover:text-(--secondary-color)/80"
          >
            Ulogujte se
          </button>
        </p>

        {message && (
          <div
            className={`p-4 rounded-md ${
              message.includes("uspešno")
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  block: AuthBlockType;
  token?: string;
  onSwitchLogin: () => void;
  onActionComplete?: (msg: string) => void;
}

export function ResetPasswordBlockView({
  block,
  token,
  onSwitchLogin,
  onActionComplete,
}: Props) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Učitavanje...</div>
        </div>
      }
    >
      <ResetPasswordContent
        block={block}
        token={token}
        onSwitchLogin={onSwitchLogin}
        onActionComplete={onActionComplete}
      />
    </Suspense>
  );
}
