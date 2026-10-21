import test from 'node:test';import assert from 'node:assert/strict';
import {publishedPackageMetadata} from '../src/lib/package-metadata';import {currentPackage} from '../src/lib/travel-packages';import {samplePackage} from './package-fixture';
test('published detail metadata uses exact content, fixed canonical and unchanged noindex',()=>{
 const p=currentPackage(samplePackage);const metadata=publishedPackageMetadata(p);assert.equal(metadata.title,'Kerala at your pace | Travel package');assert.equal(metadata.description,p.summary);assert.deepEqual(metadata.robots,{index:false,follow:false});assert.equal(metadata.alternates?.canonical,'https://maxtravel.in/packages/kerala-at-your-pace');assert.equal('offers' in metadata,false);
});
test('metadata cannot turn an invalid slug into a canonical and contains no inferred prices or ratings',()=>{
 const p=currentPackage({...samplePackage,priceValidUntil:'2020-01-01'});assert.equal(p.priceAmount,null);const metadata=publishedPackageMetadata(p);assert.equal(JSON.stringify(metadata).includes('15000'),false);assert.throws(()=>publishedPackageMetadata({...p,slug:'//evil.test'}));
});
