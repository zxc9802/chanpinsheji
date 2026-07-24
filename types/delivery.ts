export type CheckStatus = "pass" | "warning" | "fail";
export interface QualityCheckItem { id:string; title:string; status:CheckStatus; message:string; details:string[]; returnStep?:number; }
export interface ExportRecord { id:string; projectId:string; projectName:string; exportedAt:string; fileName:string; assetCount:number; }
export interface ProjectTemplate { id:string; name:string; brandName:string; styleDirections:string[]; boxTypeId:string; palette:string[]; createdAt:string; }
export interface DeliveryState { report:QualityCheckItem[]; exportRecords:ExportRecord[]; templates:ProjectTemplate[]; projectCompleted:boolean; completedAt?:string; activeTemplateId?:string; }
export const emptyDeliveryState = ():DeliveryState => ({report:[],exportRecords:[],templates:[],projectCompleted:false});
