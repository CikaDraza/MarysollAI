import { CheckIcon } from "@heroicons/react/24/outline";
import { groupAndSortServices } from "@/helpers/groupeAndSortServices";
import { formatPriceToString } from "@/helpers/formatPrice";
import { useServices } from "@/hooks/useServices";
import MiniLoader from "../MiniLoader";
import { PricingBlockType } from "@/types/landing-block";
import { Reveal } from "../motion/Reveal";
import { useEffect, useRef } from "react";

interface Props {
  block: PricingBlockType;
}

export default function PricingBlockView({ block }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useServices({ query: block.query });
  const services = data || [];

  const groupedServices = groupAndSortServices(services);

  const triggerGlobalScroll = () => {
    const mainContent = document.getElementById("main-content");
    if (mainContent && containerRef.current) {
      // Skrolujemo tako da ovaj blok dođe u vidno polje
      containerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start", // "start" je bolje za velike blokove kao cenovnik
      });
    }
  };

  // 1. Skroluj čim podaci prestanu da se učitavaju
  useEffect(() => {
    if (!isLoading && services.length > 0) {
      // Mali delay da dozvolimo React-u da renderuje listu
      const timer = setTimeout(triggerGlobalScroll, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, services.length]);

  if (isLoading)
    return (
      <div className="py-20 text-center">
        <MiniLoader text="Učitavanje cena" />
      </div>
    );
  if (services?.length === 0) return null;

  return (
    <div ref={containerRef} className="scroll-mt-20">
      <Reveal>
        <div className="bg-gray-100 rounded-3xl px-2 md:px-0 p-6 border border-gray-100 shadow-xl">
          <div className="relative isolate px-1 lg:px-8">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 -top-4 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-18"
            >
              <div
                style={{
                  clipPath:
                    "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
                }}
                className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%-30rem)] sm:w-288.75"
              />
            </div>
          </div>
          <div className="flex flex-col gap-y-4">
            {groupedServices?.map((group) => (
              <div
                key={group.category}
                className="w-full lg:py-24 px-2 lg:px-8"
              >
                <div className="mx-auto">
                  <h2 className="text-lg/6 font-semibold tracking-tight text-pretty text-gray-900 sm:text-5xl! lg:text-7xl!">
                    {group.category || "Usluga"}
                  </h2>
                </div>
                <div className="mx-auto grid grid-cols-1 gap-x-8 gap-y-16 border-t border-gray-200 pt-8 mt-8 lg:mx-0 lg:max-w-none">
                  {group.services.map((service, index) => (
                    <article
                      key={index}
                      className="flex max-w-full flex-col items-start justify-between"
                    >
                      <div className="w-full flex justify-between items-center gap-x-4 text-xs">
                        <time
                          dateTime={service?.duration?.toString()}
                          className="text-gray-500"
                        >
                          Trajanje: {service?.duration} minuta
                        </time>
                      </div>
                      <div className="group w-full relative grow">
                        <div className="mt-3 w-full flex justify-between items-center gap-x-3 text-pretty">
                          <h3 className="flex-1 md:flex-0 md:min-w-[25%] w-full text-md font-semibold text-gray-900">
                            {service.name}
                            {service.subcategory && ` - ${service.subcategory}`}
                          </h3>
                          {service.basePrice && (
                            <>
                              <hr className="flex-1 border-dashed text-gray-700" />
                              <span className="relative text-xs md:text-sm z-0 rounded-full bg-(--secondary-color) px-1 md:px-3 py-1.5 font-semibold text-white">
                                {formatPriceToString(service.basePrice)} RSD
                              </span>
                            </>
                          )}
                        </div>
                        <p className="mt-5 line-clamp-3 text-sm/6 text-gray-600">
                          {service.description}
                        </p>
                        <ul
                          role="list"
                          className="text-gray-300 mt-3 space-y-1 text-xs"
                        >
                          {service?.variants?.map((item, idx) => (
                            <li
                              key={idx}
                              className="w-full flex justify-between items-center gap-x-3 text-pretty text-gray-900 ml-0 lg:ml-6 list-disc"
                            >
                              <span className="flex gap-x-2">
                                <CheckIcon
                                  aria-hidden="true"
                                  className="text-(--secondary-color) h-6 w-5 flex-none"
                                />
                                {item.name}
                              </span>
                              <hr className="flex-1 border-dashed text-gray-700" />
                              <span className="rounded-full text-[.65rem] lg:text-sm bg-white px-3 py-0.5 font-semibold text-(--secondary-color)">
                                {formatPriceToString(item.price)}{" "}
                                <small>RSD</small>
                              </span>
                            </li>
                          ))}
                        </ul>
                        {service.items.length > 0 && (
                          <p className="mt-5 font-semibold text-gray-700">
                            Šta je uključeno
                          </p>
                        )}
                        <ul
                          role="list"
                          className="text-gray-300 mt-1 space-y-1 text-sm/6 sm:mt-3"
                        >
                          {service.items.map((item, idx) => (
                            <li
                              key={idx}
                              className="flex gap-x-3 text-pretty text-gray-900 flex-col ml-6 list-disc"
                            >
                              <span className="flex gap-x-2">
                                <CheckIcon
                                  aria-hidden="true"
                                  className="text-(--secondary-color) h-6 w-5 flex-none"
                                />
                                {item}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
