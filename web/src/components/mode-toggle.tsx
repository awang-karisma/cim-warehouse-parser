import { type Component, createEffect } from 'solid-js';
import { useColorMode } from '@kobalte/core';
import { IconSun, IconMoon, IconDeviceDesktop, IconCheck } from '@tabler/icons-solidjs';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '~/components/ui/dropdown-menu';

export const ModeToggle: Component = () => {
  const { colorMode, setColorMode } = useColorMode();

  // Keep .dark class on <html> synchronized with data-kb-theme
  createEffect(() => {
    const isDark = colorMode() === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button<"button">}
        variant="ghost"
        size="icon"
        class="size-9 rounded-md border border-input bg-background hover:bg-accent"
        aria-label="Toggle theme"
      >
        <span class="sr-only">Toggle theme</span>
        <span class="relative size-4 flex items-center justify-center">
          <IconSun class="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-foreground" />
          <IconMoon class="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-foreground" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="min-w-[8.5rem]">
        <DropdownMenuItem onSelect={() => setColorMode('light')} class="cursor-pointer gap-2 flex items-center">
          <IconSun class="size-4 text-muted-foreground" />
          <span class="flex-1">Light</span>
          {colorMode() === 'light' && <IconCheck class="size-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode('dark')} class="cursor-pointer gap-2 flex items-center">
          <IconMoon class="size-4 text-muted-foreground" />
          <span class="flex-1">Dark</span>
          {colorMode() === 'dark' && <IconCheck class="size-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode('system')} class="cursor-pointer gap-2 flex items-center">
          <IconDeviceDesktop class="size-4 text-muted-foreground" />
          <span class="flex-1">System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
