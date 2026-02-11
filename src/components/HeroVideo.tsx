export default function HeroVideo() {
  return (
    <video
      src="/marysoll-assistant-video.mp4"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      className="w-3xl max-w-none rounded-xl bg-gray-900 shadow-xl shadow-gray-500 ring-1 ring-gray-400/10 sm:w-228"
    />
  );
}
