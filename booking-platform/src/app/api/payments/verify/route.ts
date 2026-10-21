import { z } from "zod";
import { principal } from "@/lib/access";
import { sameOrigin,body,failure,json,HttpError } from "@/lib/http";
import { database } from "@/lib/db";
import { owned } from "@/lib/supplier-flow";
import { razorpay,razorpayKey } from "@/lib/providers/razorpay";
import { verifySignature } from "@/lib/signatures";
import { recordCapturedPayment } from "@/lib/paid-order";
export async function POST(request:Request){try{sameOrigin(request);const actor=await principal(request);const data=await body(request,z.object({bookingId:z.string().uuid(),razorpay_payment_id:z.string().regex(/^pay_[A-Za-z0-9]+$/),razorpay_order_id:z.string().regex(/^order_[A-Za-z0-9]+$/),razorpay_signature:z.string().length(64)}).strict());await owned("orders",data.bookingId,actor);const found=await database().query("SELECT * FROM payments WHERE order_id=$1 AND gateway_order_id=$2 AND provider='RAZORPAY'",[data.bookingId,data.razorpay_order_id]);const payment=found.rows[0];if(!payment||!verifySignature(`${payment.gateway_order_id}|${data.razorpay_payment_id}`,data.razorpay_signature,razorpayKey().secret))throw new HttpError(400,"Invalid payment verification.");const actual=await razorpay(`/payments/${data.razorpay_payment_id}`);if(actual.order_id!==payment.gateway_order_id||actual.status!=="captured")throw new HttpError(409,"Payment is not captured yet. Await verified gateway update.");await recordCapturedPayment(actual.order_id,actual.id,actual.amount,actual.currency,actual.method);return json({bookingId:data.bookingId,status:"PAYMENT_VERIFIED",message:"Payment verified. Supplier booking is processing."});}catch(e){return failure(e);}}
