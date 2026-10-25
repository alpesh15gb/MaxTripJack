import test from 'node:test';
import assert from 'node:assert/strict';
import {hotelPropertyDetails} from '../src/lib/hotel-presentation';
const details=(descriptions:unknown)=>hotelPropertyDetails({descriptions});
const description=(value:unknown)=>details({default:JSON.stringify(value)}).description;

test('bulk content descriptions project optional own headline and Overview, then Snippet only',()=>{
 assert.deepEqual(details({headline:'A quiet stay',default:JSON.stringify({Overview:'Near the old town.',Snippet:'Short fallback',Location:'Not a description'})}),{descriptionHeadline:'A quiet stay',description:'Near the old town.',amenities:[]});
 assert.equal(description({Snippet:'A supplied short description'}),'A supplied short description');
 assert.equal(description({Overview:' ',Snippet:'Fallback'}),'Fallback');
 assert.equal(description({Location:'Must not be invented as Overview'}),undefined);
 assert.equal(description({overview:'Wrong case'}),undefined);
 assert.deepEqual(hotelPropertyDetails({}),{amenities:[]});
});

test('description markup becomes plain bounded text; scripts, styles and comments never become prose',()=>{
 const content='<p>Rooms &amp; gardens&nbsp;by the sea.</p><!-- private comment --><script>alert("PRIVATE_SCRIPT")</script><style>.PRIVATE_STYLE{color:red}</style><ul><li>Breakfast &#38; tea</li><li>Ocean &#x1F30A;</li></ul>';
 assert.equal(description({Overview:content}),'Rooms & gardens by the sea. Breakfast & tea Ocean 🌊');
 assert.equal(description({Overview:'&lt;script&gt;PRIVATE_SCRIPT&lt;/script&gt;<b>Safe</b>'}),'Safe');
 assert.equal(description({Overview:'<a title="a > b" href="javascript:alert(1)">Plain link label</a>'}),'Plain link label');
 assert.equal(description({Overview:'Before <script>PRIVATE_UNCLOSED'}),'Before');
 assert.equal(description({Overview:'Before <!-- PRIVATE_UNCLOSED'}),'Before');
 assert.equal(description({Overview:'<style>PRIVATE_ONLY</style>'}),undefined);
 assert.equal(description({Overview:'A malformed <tag'}),undefined);
 assert.equal(description({Overview:'&#0;&#xD800;&#1114112;&#127;Safe'}),'Safe');
 assert.equal(details({headline:'<b>Stay &quot;Here&quot;</b>'}).descriptionHeadline,'Stay "Here"');
});

test('malformed, array, nonstring and prototype-bearing description payloads are omitted',()=>{
 for(const value of [null,[],true,3,'plain text',{default:null},{default:'bad-json'},{default:JSON.stringify([])},{default:JSON.stringify('plain string')},{default:JSON.stringify({Overview:42,Snippet:'Do not rescue malformed data'})},{default:JSON.stringify({Overview:'Safe',unexpected:{nested:true}})}])assert.equal(details(value).description,undefined);
 for(const key of ['__proto__','prototype','constructor']){
  assert.equal(details(JSON.parse(`{"${key}":{},"headline":"No","default":"{}"}`)).descriptionHeadline,undefined);
  assert.equal(details({default:`{"${key}":"No","Overview":"No"}`}).description,undefined);
 }
 assert.equal(details(Object.create({headline:'Inherited',default:JSON.stringify({Overview:'Inherited'})})).description,undefined);
 assert.equal(details(Object.create({headline:'Inherited'})).descriptionHeadline,undefined);
 const source=Object.create({descriptions:{headline:'Inherited',default:JSON.stringify({Overview:'Inherited'})}});
 assert.equal(hotelPropertyDetails(source).description,undefined);
 assert.equal(({} as {polluted?:unknown}).polluted,undefined);
});

test('description caps reject oversized input before parse and cap projected copy without changing other property data',()=>{
 assert.equal(description({Overview:'a'.repeat(5000)})?.length,4000);
 assert.equal(details({headline:'b'.repeat(500)}).descriptionHeadline?.length,200);
 assert.equal(details({headline:'b'.repeat(32001)}).descriptionHeadline,undefined);
 assert.equal(details({default:JSON.stringify({Overview:'a'.repeat(32000)})}).description,undefined);
 assert.equal(details({default:' '.repeat(32001)+'{}'}).description,undefined);
 const source={star_rating:'4',property_type:{name:'Hotel'},locale:{address:{fulladdr:'Known address'}},amenities:{'1':{name:'Pool'}},descriptions:{default:JSON.stringify({Overview:'Known prose'})},pricing:{totalPrice:123},cancellation:{isRefundable:true},images:[{links:{Standard:{href:'https://untrusted.example/photo.jpg'}}}]};
 assert.deepEqual(hotelPropertyDetails(source),{starRating:4,propertyType:'Hotel',address:'Known address',amenities:['Pool'],description:'Known prose'});
});
