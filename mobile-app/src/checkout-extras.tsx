import React,{useState,useEffect,useRef} from "react";
import { View,Text,Pressable,StyleSheet,ScrollView } from "react-native";
import { api } from "./api";
import { ApiHttpError } from "./api-transport";
type Choice={segmentId:string;travellerIndex:number;kind:"BAGGAGE"|"MEAL"|"SEAT";code:string};
type Segment={id:string;tripIndex:number;label:string;options:{kind:Choice["kind"];code:string;label:string;amountMinor:number;exitRow?:boolean}[]};
type Catalogue={segments:Segment[];travellerTypes:string[];choices:Choice[]};
export default function CheckoutExtras({quoteId,disabled,onPending,onSaved}:{quoteId:string;disabled:boolean;onPending:(pending:boolean)=>void;onSaved:(total:number)=>void}){
 const mounted=useRef(true),working=useRef(false);
 useEffect(()=>{
  mounted.current=true;
  return()=>{mounted.current=false;onPending(false);};
 },[onPending]);
 const [open,setOpen]=useState<string|null>(null),[data,setData]=useState<Catalogue|null>(null);
 const [choices,setChoices]=useState<Choice[]>([]),[savedChoices,setSavedChoices]=useState<Choice[]>([]);
 const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState("");
 async function load(){
  if(working.current)return;
  working.current=true;setBusy(true);setError("");
  try{
   const value=await api<Catalogue>(`/api/travel/checkout-extras?quoteId=${encodeURIComponent(quoteId)}`);
   if(!mounted.current)return;
   setData(value);setChoices(value.choices);setSavedChoices(value.choices);setDirty(false);onPending(false);
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:"Unable to load extras.");}
  finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 async function save(){
  if(working.current||!dirty)return;
  working.current=true;setBusy(true);setError("");
  try{
   const result=await api<{quoteId:string;totalMinor:number}>("/api/travel/checkout-extras",{quoteId,choices});
   if(result.quoteId!==quoteId||!Number.isSafeInteger(result.totalMinor)||result.totalMinor<=0)throw Error("The updated total could not be verified.");
   if(!mounted.current)return;
   onSaved(result.totalMinor);onPending(false);setSavedChoices(choices);setDirty(false);setUncertain(false);
  }catch(e){
   if(!mounted.current)return;
   if(!(e instanceof ApiHttpError&&e.hasServerError&&e.status===400))setUncertain(true);
   setError(e instanceof Error?e.message:"Unable to confirm the extras update.");
  }finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 function discard(){
  if(working.current||uncertain)return;
  setChoices(savedChoices);setDirty(false);setOpen(null);setError("");onPending(false);
 }
 const button=(label:string,action:()=>void,selected=false)=><Action title={label} onPress={action} selected={selected} disabled={disabled||busy||uncertain}/>;
 return <View style={styles.box}>
  <Text style={styles.title}>Seats, meals & baggage</Text>
  <Text>Optional extras, priced by the airline. Connecting baggage applies once per journey. Infants and exit-row seats require airline assistance.</Text>
  {!data?<Action title={busy?"Loading extras…":"Choose flight extras"} onPress={()=>void load()} disabled={disabled||busy}/>:<>
   {data.segments.map(segment=><View key={segment.id} style={styles.box}>
    <Text style={styles.title}>{segment.label}</Text>
    {data.travellerTypes.map((type,index)=>type==="INFANT"?null:<View key={index}>
     <Text style={styles.title}>Traveller {index+1} · {type}</Text>
     {(["BAGGAGE","MEAL","SEAT"] as const).map(kind=>{
      const options=segment.options.filter(option=>option.kind===kind&&!option.exitRow);
      if(!options.length)return null;
      const inGroup=(choice:Choice)=>choice.travellerIndex===index&&choice.kind===kind&&(
       kind==="BAGGAGE"?data.segments.find(row=>row.id===choice.segmentId)?.tripIndex===segment.tripIndex:choice.segmentId===segment.id
      );
      const selected=choices.find(inGroup);
      const savedLabel=data.segments.find(row=>row.id===selected?.segmentId)?.options.find(option=>option.kind===kind&&option.code===selected?.code)?.label;
      const group=`${segment.id}:${index}:${kind}`;
      function choose(code?:string){
       setOpen(null);
       if(code===selected?.code&&(kind==="BAGGAGE"||code===undefined||selected?.segmentId===segment.id))return;
       setChoices(current=>[...current.filter(choice=>!inGroup(choice)),...(code?[{segmentId:segment.id,travellerIndex:index,kind,code}]:[])]);
       setDirty(true);onPending(true);
      }
      return <View key={kind}>
       {button(`${kind==="BAGGAGE"?"Baggage for this journey":kind}: ${selected?savedLabel??"Saved selection":"No extra"}`,()=>setOpen(current=>current===group?null:group))}
       {open===group&&<ScrollView style={{maxHeight:280}} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {button("No extra / airline allocation",()=>choose(),!selected)}
        {options.map(option=><React.Fragment key={option.code}>
         {button(`${option.label} · ₹${(option.amountMinor/100).toLocaleString("en-IN")}`,()=>choose(option.code),selected?.code===option.code)}
        </React.Fragment>)}
       </ScrollView>}
      </View>;
     })}
    </View>)}
   </View>)}
   <Action title={busy?"Checking extras…":uncertain?"Retry the existing extras update":"Apply extras and update total"} onPress={()=>void save()} disabled={disabled||busy||!dirty}/>
   {dirty&&!uncertain&&<Action title="Discard unapplied extras" onPress={discard} disabled={busy}/>}
   {uncertain&&<Text style={styles.error}>The saved changes are uncertain. Retry this update before paying, or change selection after this review expires.</Text>}
  </>}
  {error!==""&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
 </View>;
}
function Action({title,onPress,selected,disabled}:{title:string;onPress:()=>void;selected?:boolean;disabled:boolean}){return <Pressable accessibilityRole="button" accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} style={[styles.button,selected&&styles.selected,disabled&&{opacity:.55}]}><Text style={{color:"#001736",fontSize:14}}>{title}</Text></Pressable>;}
const styles=StyleSheet.create({box:{padding:12,borderWidth:1,borderColor:"#dce2eb",borderRadius:12,gap:10,marginVertical:8},title:{fontWeight:"700",fontSize:15,color:"#001736"},button:{padding:12,marginVertical:4,minHeight:44,borderRadius:10,borderWidth:1,borderColor:"#cad3df",backgroundColor:"#f7f9fc"},selected:{backgroundColor:"#e4efff",borderColor:"#005bb3"},error:{color:"#a21d2a",fontSize:13,lineHeight:20}});
