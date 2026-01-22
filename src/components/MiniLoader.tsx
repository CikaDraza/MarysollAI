"use client";

export default function MiniLoader({ text }: { text?: string }) {
  return (
    <div className="text-center mx-auto my-20">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-(--secondary-color) mx-auto"></div>
      <p className="mt-4 text-gray-600">{text || "Učitavanje..."}</p>
    </div>
  );
}
