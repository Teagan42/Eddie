import { ApiClient } from "@eddie/api-client";
import { ReactNode } from "react"

export type ApiProvider = ({ children }: { children: ReactNode }) => JSX.Element;

export type useApiProvider = () => ApiClient;