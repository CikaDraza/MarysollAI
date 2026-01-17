import { ImageBlockProps } from "@/types";
import Image from "next/image";

export default function ImagesBlock({ images }: ImageBlockProps) {
  return (
    <div className="mx-auto">
      {images.length === 1 && (
        <div className="mx-auto mt-6 max-w-2xl sm:px-6 lg:grid lg:max-w-7xl lg:grid-cols-1 lg:gap-8 lg:px-8">
          <Image
            width={200}
            height={200}
            alt={images[0].alt}
            src={images[0].imageUrl}
            className="row-span-2 aspect-3/4 size-full rounded-lg object-cover max-lg:hidden"
          />
        </div>
      )}
      {images.length === 2 && (
        <div className="mx-auto mt-6 max-w-2xl sm:px-6 lg:grid lg:max-w-7xl lg:grid-cols-2 lg:gap-8 lg:px-8">
          <Image
            width={200}
            height={200}
            alt={images[0].alt}
            src={images[0].imageUrl}
            className="row-span-2 aspect-3/4 size-full rounded-lg object-cover max-lg:hidden"
          />
          <Image
            width={200}
            height={200}
            alt={images[1].alt}
            src={images[1].imageUrl}
            className="col-start-2 aspect-3/2 size-full rounded-lg object-cover max-lg:hidden"
          />
        </div>
      )}
      {images.length === 3 && (
        <div className="mx-auto mt-6 max-w-2xl sm:px-6 lg:grid lg:max-w-7xl lg:grid-cols-2 lg:gap-8 lg:px-8">
          <Image
            width={200}
            height={200}
            alt={images[0].alt}
            src={images[0].imageUrl}
            className="row-span-2 aspect-3/4 size-full rounded-lg object-cover max-lg:hidden"
          />
          <Image
            width={200}
            height={200}
            alt={images[1].alt}
            src={images[1].imageUrl}
            className="col-start-2 aspect-3/2 size-full rounded-lg object-cover max-lg:hidden"
          />
          <Image
            width={200}
            height={200}
            alt={images[2].alt}
            src={images[2].imageUrl}
            className="col-start-2 row-start-2 aspect-3/2 size-full rounded-lg object-cover max-lg:hidden"
          />
        </div>
      )}
      {images.length === 4 && (
        <div className="mx-auto mt-6 max-w-2xl sm:px-6 lg:grid lg:max-w-7xl lg:grid-cols-3 lg:gap-8 lg:px-8">
          <Image
            width={200}
            height={200}
            alt={images[0].alt}
            src={images[0].imageUrl}
            className="row-span-2 aspect-3/4 size-full rounded-lg object-cover max-lg:hidden"
          />
          <Image
            width={200}
            height={200}
            alt={images[1].alt}
            src={images[1].imageUrl}
            className="col-start-2 aspect-3/2 size-full rounded-lg object-cover max-lg:hidden"
          />
          <Image
            width={200}
            height={200}
            alt={images[2].alt}
            src={images[2].imageUrl}
            className="col-start-2 row-start-2 aspect-3/2 size-full rounded-lg object-cover max-lg:hidden"
          />
          <Image
            alt={images[3].alt}
            src={images[3].imageUrl}
            className="row-span-2 aspect-4/5 size-full object-cover sm:rounded-lg lg:aspect-3/4"
          />
        </div>
      )}
    </div>
  );
}
