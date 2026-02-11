import Image from "next/image";

export default function LandingHero() {
  return (
    <div className="relative isolate overflow-hidden px-6 py-24 sm:py-32 lg:overflow-visible lg:px-0">
      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 lg:mx-0 lg:max-w-none lg:grid-cols-2 lg:items-start lg:gap-y-10">
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1 lg:mx-auto lg:grid lg:w-full lg:max-w-7xl lg:grid-cols-2 lg:gap-x-8 lg:px-8">
          <div className="lg:pr-4">
            <div className="sm:max-w-lg">
              <p className="text-base/7 font-semibold text-(--secondary-color)">
                AI chat
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                Marysoll Assistant
              </h1>
              <p className="mt-4 text-xl text-gray-500">
                A smart AI assistant for content and scheduling - all in one
                place
              </p>
            </div>
          </div>
        </div>
        <div className="-mt-12 -ml-12 p-12 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-hidden">
          <Image
            width={768}
            height={768}
            alt=""
            src="/marysoll-assistant-hero.png"
            className="w-3xl max-w-none rounded-xl bg-gray-900 shadow-xl shadow-gray-500 ring-1 ring-gray-400/10 sm:w-228"
          />
        </div>
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:mx-auto lg:grid lg:w-full lg:max-w-7xl lg:grid-cols-2 lg:gap-x-8 lg:px-8">
          <div className="lg:pr-4">
            <div className="max-w-xl text-base/7 text-gray-600 lg:max-w-lg">
              <p>
                Talk to an AI assistant that understands your content, guides
                you through appointments and connects you with beauty salons.
              </p>
              <ul role="list" className="mt-8 space-y-8 text-gray-600">
                <li className="flex gap-x-3">
                  {"⚡ "}
                  <span>
                    <strong className="font-semibold text-gray-900">
                      Quick AI responses
                    </strong>
                  </span>
                </li>
                <li className="flex gap-x-3">
                  {"📅 "}
                  <span>
                    <strong className="font-semibold text-gray-900">
                      Smart appointment scheduling
                    </strong>
                  </span>
                </li>
                <li className="flex gap-x-3">
                  {"✍️ "}
                  <span>
                    <strong className="font-semibold text-gray-900">
                      Salon recommendations and ratings
                    </strong>
                  </span>
                </li>
                <li className="flex gap-x-3">
                  {"🧠 "}
                  <span>
                    <strong className="font-semibold text-gray-900">
                      Understands your content
                    </strong>
                  </span>
                </li>
              </ul>
              <p className="mt-8">
                Marysoll Assistant is an AI chat platform that connects content
                and action. Users don&apos;t just read blogs and newsletters -
                they schedule appointments, choose salons and make decisions in
                real time with the AI ​​assistant. We are focused on the beauty
                industry, but with a scalable AI model that easily expands to
                other verticals.
              </p>
              <h2 className="mt-16 text-2xl font-bold tracking-tight text-gray-900">
                AI assistant for blogs, newsletters and scheduling appointments
                in beauty salons.
              </h2>
              <p className="mt-6">
                Marysoll Assistant transforms static content into an interactive
                experience. Instead of users passively reading blogs and
                newsletters, they talk to an AI assistant that understands the
                content, suggests relevant salons and enables direct appointment
                scheduling.
              </p>
              <p className="mt-6">
                The platform solves a key problem: the disconnect between
                information and action. Marysoll Assistant removes that
                interruption. AI is integrated directly into the web application
                and serves as a central point for content, recommendations and
                reservations.
              </p>
              <p className="mt-6">
                The focus is on the beauty industry – salons, services,
                referrals – but the infrastructure is vertical agnostic.
                Monetization comes through premium lounges, appointments,
                featured positions and AI-powered content services.
              </p>
              <p className="mt-6">
                Marysoll Assistant is not a chatbot. It is the interface between
                content and the real world.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
