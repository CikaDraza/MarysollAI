import LandingCampaigns from "@/components/LandingCampaigns";
import LandingHero from "@/components/LandingHero";

export default function Home() {
  return (
    <div className="bg-transparent pb-0">
      <LandingHero />
      <LandingCampaigns />
    </div>
  );
}
