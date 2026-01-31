// components/Paginator.tsx
"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface PaginatorProps {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
  showCount?: boolean;
}

export default function Paginator({
  pagination,
  onPageChange,
  showCount = true,
}: PaginatorProps) {
  const { page, limit, totalCount, totalPages, hasNextPage, hasPrevPage } =
    pagination;

  if (totalPages <= 1) return null;

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalCount);

  // Generiši brojeve stranica za prikaz
  const getPageNumbers = () => {
    const pageNumbers: number[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Prikaži sve stranice
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else if (page <= 3) {
      // Prikaži prve 5 stranica
      for (let i = 1; i <= maxVisiblePages; i++) {
        pageNumbers.push(i);
      }
    } else if (page >= totalPages - 2) {
      // Prikaži zadnjih 5 stranica
      for (let i = totalPages - 4; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Prikaži 2 stranice pre i 2 posle trenutne
      for (let i = page - 2; i <= page + 2; i++) {
        pageNumbers.push(i);
      }
    }

    return pageNumbers;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevPage}
          className="cursor-pointer relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Prethodna
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
          className="cursor-pointer relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Sledeća
        </button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        {showCount && (
          <div>
            <p className="text-sm text-gray-700">
              Prikazuje se <span className="font-medium">{startItem}</span> do{" "}
              <span className="font-medium">{endItem}</span> od{" "}
              <span className="font-medium">{totalCount}</span> rezultata
            </p>
          </div>
        )}
        <div>
          <nav
            aria-label="Pagination"
            className="isolate inline-flex -space-x-px rounded-md shadow-xs"
          >
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={!hasPrevPage}
              className="cursor-pointer relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Prethodna</span>
              <ChevronLeftIcon aria-hidden="true" className="size-5" />
            </button>

            {pageNumbers.map((pageNum, index) => {
              // Dodaj "..." između brojeva ako ima rupa
              if (
                index > 0 &&
                pageNum - pageNumbers[index - 1] > 1 &&
                pageNumbers.length > 1
              ) {
                return (
                  <span
                    key={`ellipsis-${pageNum}`}
                    className="cursor-pointer relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 focus:outline-offset-0"
                  >
                    ...
                  </span>
                );
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`cursor-pointer relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                    page === pageNum
                      ? "z-10 bg-(--secondary-color) text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--secondary-color)"
                      : "text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNextPage}
              className="cursor-pointer relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Sledeća</span>
              <ChevronRightIcon aria-hidden="true" className="size-5" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
