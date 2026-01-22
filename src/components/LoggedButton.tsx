"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";

interface User {
  name?: string;
}

interface LoggedButtonProps {
  user: User | null;
  logout: () => void;
  onCloseMobileMenu?: () => void;
}

export default function LoggedButton({
  user,
  logout,
  onCloseMobileMenu,
}: LoggedButtonProps) {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton className="inline-flex items-center gap-x-1.5 rounded-md bg-black px-3 py-2 text-xs 2xl:text-sm font-semibold text-white hover:bg-gray-800">
        Dobro došli, {user?.name || "korisniče"}
        <ChevronDownIcon aria-hidden="true" className="size-5 text-gray-400" />
      </MenuButton>

      <MenuItems
        transition
        className="absolute right-0 z-10 mt-2 w-44 lg:w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-gray-200 focus:outline-none"
      >
        <MenuItem>
          <button
            onClick={() => {
              logout();
              if (onCloseMobileMenu) {
                onCloseMobileMenu();
              }
            }}
            className="block w-full border-t border-gray-200 text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Odjavi se
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
