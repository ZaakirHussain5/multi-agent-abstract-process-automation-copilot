import { Command } from "cmdk";
import { Briefcase, Home, Moon, Sun, SunMoon, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui";
import { useTheme } from "@/lib/theme";

export function CommandPalette({
  open,
  onOpenChange,
  onShortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShortcuts: () => void;
}) {
  const navigate = useNavigate();
  const { setChoice } = useTheme();

  function go(path: string) {
    navigate(path);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Command menu" hideHeader className="overflow-hidden p-0">
        <Command className="flex flex-col" label="Command menu">
          <Command.Input
            placeholder="Type a command…"
            className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-80 overflow-auto p-2 scrollbar-thin">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</Command.Empty>
            <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
              <Item icon={<Home className="h-3.5 w-3.5" />} onSelect={() => go("/")}>
                New team
              </Item>
              <Item icon={<Briefcase className="h-3.5 w-3.5" />} onSelect={() => go("/jobs")}>
                Jobs
              </Item>
              <Item icon={<Users className="h-3.5 w-3.5" />} onSelect={() => go("/templates")}>
                Templates
              </Item>
            </Command.Group>
            <Command.Group heading="Appearance" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
              <Item
                icon={<Sun className="h-3.5 w-3.5" />}
                onSelect={() => {
                  setChoice("light");
                  onOpenChange(false);
                }}
              >
                Light
              </Item>
              <Item
                icon={<Moon className="h-3.5 w-3.5" />}
                onSelect={() => {
                  setChoice("dark");
                  onOpenChange(false);
                }}
              >
                Dark
              </Item>
              <Item
                icon={<SunMoon className="h-3.5 w-3.5" />}
                onSelect={() => {
                  setChoice("system");
                  onOpenChange(false);
                }}
              >
                System theme
              </Item>
            </Command.Group>
            <Command.Group heading="Help" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
              <Item
                onSelect={() => {
                  onOpenChange(false);
                  onShortcuts();
                }}
              >
                Keyboard shortcuts
              </Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Item({
  children,
  onSelect,
  icon,
}: {
  children: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[13px] aria-selected:bg-accent"
    >
      {icon}
      {children}
    </Command.Item>
  );
}
