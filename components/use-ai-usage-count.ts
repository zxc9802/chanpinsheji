"use client";
import { useEffect,useState } from "react";
import { getUsageCount,type AiUsageRecord } from "@/lib/ai-usage";
export function useAiUsageCount(generator:AiUsageRecord["generator"]){const[count,setCount]=useState(0);useEffect(()=>{const update=()=>setCount(getUsageCount(generator));update();window.addEventListener("ai-usage-updated",update);return()=>window.removeEventListener("ai-usage-updated",update)},[generator]);return count;}
