import { Badge, Flex, Text, TextField } from "@radix-ui/themes";
import { Panel } from "@eddie/ui";

interface OverviewAuthPanelProps {
  apiKey: string | null;
  onApiKeyChange: (value: string | null) => void;
}

export function OverviewAuthPanel({ apiKey, onApiKeyChange }: OverviewAuthPanelProps): JSX.Element {
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
            value={apiKey ?? ""}
            onChange={(event) => onApiKeyChange(event.target.value || null)}
            className="w-full md:w-auto md:min-w-[320px]"
            variant="surface"
          />
          <Badge color="grass" variant="soft">
            Secure & Local Only
          </Badge>
        </Flex>
      </Flex>
    </Panel>
  );
}
