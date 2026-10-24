export const valid={version:1,blocked:false,lines:[
 {label:'Supplier quote validity (seconds)',text:'180'},
 {label:'Service restriction',text:'Extras cannot be refunded'},
 {label:'Supplier notice',text:'Seat eligibility still applies'},
]};
export const unsafe=[undefined,null,[],{}, {conditions:{st:180},alerts:['PRIVATE_SUPPLIER_VALUE']},
 {...valid,version:2}, {...valid,blocked:'false'}, {...valid,extra:'PRIVATE_SUPPLIER_VALUE'},
 {...valid,lines:[{label:['Supplier notice'],text:'PRIVATE_SUPPLIER_VALUE'}]}, {...valid,lines:null}, {...valid,lines:[null]}, {...valid,lines:[{label:'Commission',text:'PRIVATE_SUPPLIER_VALUE'}]},
 {...valid,lines:[{label:'Supplier notice',text:{secret:'PRIVATE_SUPPLIER_VALUE'}}]},
 {...valid,lines:[{label:'Supplier notice',text:'safe',secret:'PRIVATE_SUPPLIER_VALUE'}]},
 {...valid,lines:[{label:'Supplier notice',text:''}]},
 {...valid,lines:[{label:'Supplier notice',text:'x'.repeat(2001)}]},
 {...valid,lines:[{label:'Supplier notice',text:'unsafe\u0000text'}]},
 {...valid,lines:Array(51).fill(valid.lines[0])},
 {...valid,blocked:true,lines:[{label:'Supplier notice',text:'PRIVATE_SUPPLIER_VALUE'}]},
];
