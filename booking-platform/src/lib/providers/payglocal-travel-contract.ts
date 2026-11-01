import {HttpError} from '../http';
// PayGlocal's merchant email requires a separate travel payload attachment.
// The merchant confirmed it was not included. No environment flag can replace
// implementing and validating that missing contract. Existing status/refund
// reconciliation remains independent of this NEW-checkout gate.
export function payGlocalTravelContractReady():boolean{return false;}
export function assertPayGlocalTravelContract(){if(!payGlocalTravelContractReady())throw new HttpError(503,'Online payment is not available yet. No payment was initiated.');}
