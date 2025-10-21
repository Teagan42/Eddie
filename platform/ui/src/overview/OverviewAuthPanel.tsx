import { Badge, Flex, Text, TextField } from "@radix-ui/themes";
import { useEffect, useState, type ChangeEvent, type JSX } from "react";

import { Panel } from "../common";
import type { OverviewAuthPanelProps } from "./types";

export type { OverviewAuthPanelProps } from "./types";

export function OverviewAuthPanel({
  apiKey,
  onApiKeyChange,
}: OverviewAuthPanelProps): JSX.Element {
  const normalizedApiKey = apiKey ?? "";
  const [draftApiKey, setDraftApiKey] = useState(normalizedApiKey);

  useEffect(() => {
    setDraftApiKey(normalizedApiKey);
  }, [normalizedApiKey]);

  const handleApiKeyChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextValue = event.target.value ?? "";
    setDraftApiKey(nextValue);
    onApiKeyChange(nextValue.length > 0 ? nextValue : null);
  };

  return (
    <Panel
      title="Authentication"
      description="Provide an Eddie API key to unlock administrative surfaces"
      className="scroll-mt-24"
      id="authentication"
    >
      <Flex direction="column" gap="4">
        <Text size="2" color="gray">
          Paste your Eddie API key to unlock live orchestration tools.
        </Text>
        <Flex gap="3" align="center" wrap="wrap">
          <TextField.Root
            placeholder="Enter API key"
            value={draftApiKey}
            onChange={handleApiKeyChange}
            className="w-full md:w-auto md:min-w-[320px]"
            variant="surface"
          />
          <Badge
            variant="soft"
            className="bg-[color:var(--hero-badge-bg)] text-[color:var(--hero-badge-fg)] dark:bg-[color:var(--hero-badge-bg-dark)] dark:text-[color:var(--hero-badge-fg-dark)]"
          >
            Secure & Local Only
          </Badge>
        </Flex>
      </Flex>
    </Panel>
  );
}
