import { executeCrmCommand } from "@/lib/crm-commands";
import { failure } from "@/lib/http";
export async function POST(request:Request){try{return await executeCrmCommand(request);}catch(error){return failure(error);}}
