"use client";

import { HeroVisualBlock } from "@/types/landing-blocks";
import { Reveal } from "../motion/Reveal";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import Image from "next/image";

// Varijante za kontejner koji drži slike
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15, // Vreme između pojavljivanja dve slike
      delayChildren: 0.3, // Početno kašnjenje pre prve slike
    },
  },
};

// Varijante za svaku pojedinačnu sliku
const itemVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 100 },
  },
};

export default function HeroVisualBlockView({
  block,
}: {
  block: HeroVisualBlock;
}) {
  // Filtriramo sve što nije validan string (izbacuje null, undefined, "")
  const validImages = block.imagesUrl?.filter((url) => Boolean(url)) || [];

  return (
    <Reveal>
      <section className="py-16 overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 lg:flex lg:items-center lg:gap-x-10">
          {/* Tekstualni deo */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            className="mx-auto max-w-2xl lg:mx-0 lg:flex-auto"
          >
            <h2 className="text-4xl! font-bold tracking-tight sm:text-6xl">
              {block.title}
            </h2>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              {block.subtitle}
            </p>
            {block.href && block.ctaLabel && (
              <Link
                href={block.href || "/"}
                className="inline-block rounded-md border border-transparent bg-(--secondary-color)/90 px-8 py-3 text-center font-medium text-white hover:bg-(--secondary-color)"
              >
                {block.ctaLabel}
              </Link>
            )}
          </motion.div>

          {/* Grid sa slikama koji koristi staggerChildren */}
          {validImages.length > 0 && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              whileInView="show" // Animacija se okida kada kontejner uđe u vidokrug
              viewport={{ once: true }}
              className="mt-16 flex justify-center sm:mt-24 lg:mt-0 lg:shrink-0 lg:grow"
            >
              <div className="flex items-center space-x-6 lg:space-x-8">
                {/* Prva kolona */}
                <div className="grid shrink-0 grid-cols-1 gap-y-6 lg:gap-y-8">
                  {validImages.slice(0, 2).map((url, idx) => {
                    return (
                      <motion.div
                        key={`col1-${idx}`}
                        variants={itemVariants}
                        className="h-64 w-44 overflow-hidden rounded-lg"
                      >
                        <Image
                          width={200}
                          height={300}
                          src={url}
                          alt=""
                          className="h-full w-full object-cover shadow-xl"
                        />
                      </motion.div>
                    );
                  })}
                </div>
                {/* Druga kolona (Sredina) */}
                <div className="grid shrink-0 grid-cols-1 gap-y-6 lg:gap-y-8">
                  {validImages.slice(2, 5).map((url, idx) => {
                    return (
                      <motion.div
                        key={`col2-${idx}`}
                        variants={itemVariants}
                        className="h-64 w-44 overflow-hidden rounded-lg"
                      >
                        <Image
                          width={200}
                          height={300}
                          src={url}
                          alt=""
                          className="h-full w-full object-cover shadow-xl"
                        />
                      </motion.div>
                    );
                  })}
                </div>
                {/* Treća kolona */}
                <div className="grid shrink-0 grid-cols-1 gap-y-6 lg:gap-y-8">
                  {validImages.slice(5).map((url, idx) => {
                    return (
                      <motion.div
                        key={`col3-${idx}`}
                        variants={itemVariants}
                        className="h-64 w-44 overflow-hidden rounded-lg"
                      >
                        <Image
                          width={200}
                          height={300}
                          src={url}
                          alt=""
                          className="h-full w-full object-cover shadow-xl"
                        />
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </section>
    </Reveal>
  );
}
