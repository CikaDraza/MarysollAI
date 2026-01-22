export default function LoaderButton() {
  return (
    <div className="flex space-x-1 px-3 py-1.5">
      <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></div>
      <div
        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
        style={{ animationDelay: "0.1s" }}
      ></div>
      <div
        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
        style={{ animationDelay: "0.2s" }}
      ></div>
    </div>
  );
}
