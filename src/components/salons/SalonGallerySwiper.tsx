"use client";

import { Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { SalonPreviewImage } from "@/types/salon-preview";

interface Props {
  images: SalonPreviewImage[];
  salonName: string;
}

export default function SalonGallerySwiper({ images, salonName }: Props) {
  if (images.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-[8px] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <Swiper
        modules={[Navigation, Pagination]}
        navigation={images.length > 1}
        pagination={images.length > 1 ? { clickable: true } : false}
        slidesPerView={1}
        className="aspect-[16/10] min-h-[360px]"
      >
        {images.map((image, index) => (
          <SwiperSlide key={`${image.url}-${index}`}>
            <img
              src={image.url}
              alt={image.alt ?? `${salonName} galerija ${index + 1}`}
              className="h-full w-full object-cover"
            />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
