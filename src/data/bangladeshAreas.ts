/**
 * Comprehensive Bangladesh Districts and Upazilas/Thanas Dataset
 * Covers all 64 Districts with their major Upazilas, Thanas, and Metropolitan Areas.
 * Formatted for searchable dropdowns: "District - Upazila/Thana"
 */

export interface BangladeshLocation {
  district: string;
  upazila: string;
  displayName: string;
  zone: 'inside_dhaka' | 'outside_dhaka';
}

export const BANGLADESH_DISTRICT_UPAZILA_MAP: Record<string, string[]> = {
  'Dhaka': [
    'Adabor', 'Badda', 'Bangshal', 'Biman Bandar', 'Cantonment', 'Chawkbazar',
    'Dakshinkhan', 'Darus Salam', 'Demra', 'Dhanmondi', 'Gendaria', 'Gulshan',
    'Hazaribagh', 'Jatrabari', 'Kadamtali', 'Kafrul', 'Kalabagan', 'Kamrangirchar',
    'Khilgaon', 'Khilkhet', 'Kotwali', 'Lalbagh', 'Mirpur', 'Mohammadpur',
    'Motijheel', 'New Market', 'Pallabi', 'Paltan', 'Panthapath', 'Ramna',
    'Rampura', 'Sabujbagh', 'Shah Ali', 'Shahbagh', 'Sher-e-Bangla Nagar',
    'Shyampur', 'Sutrapur', 'Tejgaon', 'Tejgaon Industrial Area', 'Turag',
    'Uttar Khan', 'Uttara', 'Dhamrai', 'Dohar', 'Keraniganj', 'Nawabganj', 'Savar'
  ],
  'Chattogram': [
    'Bakalia', 'Bayezid', 'Chandgaon', 'Double Mooring', 'Halishahar', 'Khulshi',
    'Kotwali', 'Pahartali', 'Panchlaish', 'Patenga', 'Anwara', 'Banshkhali',
    'Boalkhali', 'Chandanaish', 'Fatikchhari', 'Hathazari', 'Karnaphuli',
    'Lohagara', 'Mirsharai', 'Patiya', 'Rangunia', 'Raozan', 'Sandwip',
    'Satkania', 'Sitakunda'
  ],
  'Gazipur': [
    'Gazipur Sadar', 'Kaliakair', 'Kaliganj', 'Kapasia', 'Sreepur', 'Tongi'
  ],
  'Narayanganj': [
    'Araihazar', 'Bandar', 'Narayanganj Sadar', 'Rupganj', 'Sonargaon', 'Siddhirganj'
  ],
  'Bagerhat': [
    'Bagerhat Sadar', 'Chitalmari', 'Fakirhat', 'Kachua', 'Mollahat',
    'Mongla', 'Morrelganj', 'Rampal', 'Sarankhola'
  ],
  'Bandarban': [
    'Ali Kadam', 'Bandarban Sadar', 'Lama', 'Naikhongchhari', 'Rowangchhari',
    'Ruma', 'Thanchi'
  ],
  'Barguna': [
    'Amtali', 'Bamna', 'Barguna Sadar', 'Betagi', 'Patharghata', 'Taltali'
  ],
  'Barishal': [
    'Agailjhara', 'Babuganj', 'Bakerganj', 'Banaripara', 'Barishal Sadar',
    'Gaurnadi', 'Hizla', 'Mehendiganj', 'Muladi', 'Wazirpur'
  ],
  'Bhola': [
    'Bhola Sadar', 'Burhanuddin', 'Char Fasson', 'Daulatkhan', 'Lalmohan',
    'Manpura', 'Tazumuddin'
  ],
  'Bogura': [
    'Adamdighi', 'Bogura Sadar', 'Dhunat', 'Dhupchanchia', 'Gabtali',
    'Kahaloo', 'Nandigram', 'Sariakandi', 'Shajahanpur', 'Sherpur',
    'Shibganj', 'Sonatala'
  ],
  'Brahmanbaria': [
    'Akhaura', 'Ashuganj', 'Bancharampur', 'Bijoynagar', 'Brahmanbaria Sadar',
    'Kasba', 'Nabinagar', 'Nasirnagar', 'Sarail'
  ],
  'Chandpur': [
    'Chandpur Sadar', 'Faridganj', 'Haimchar', 'Haziganj', 'Kachua',
    'Matlab Dakshin', 'Matlab Uttar', 'Shahrasti'
  ],
  'Chapainawabganj': [
    'Bholahat', 'Chapainawabganj Sadar', 'Gomastapur', 'Nachole', 'Shibganj'
  ],
  'Chuadanga': [
    'Alamdanga', 'Chuadanga Sadar', 'Damurhuda', 'Jibannagar'
  ],
  'Cox\'s Bazar': [
    'Chakaria', 'Cox\'s Bazar Sadar', 'Eidgaon', 'Kutubdia', 'Maheshkhali',
    'Pekua', 'Ramu', 'Teknaf', 'Ukhiya'
  ],
  'Cumilla': [
    'Barura', 'Brahmanpara', 'Burichang', 'Chandina', 'Chauddagram',
    'Cumilla Sadar', 'Cumilla Sadar Dakshin', 'Daudkandi', 'Debidwar',
    'Homna', 'Laksam', 'Lalmai', 'Meghna', 'Monohargonj', 'Muradnagar',
    'Nangalkot', 'Titas'
  ],
  'Dinajpur': [
    'Birampur', 'Birganj', 'Biral', 'Bochaganj', 'Chirirbandar',
    'Dinajpur Sadar', 'Fulbari', 'Ghoraghat', 'Hakimpur', 'Kaharole',
    'Khansama', 'Nawabganj', 'Parbatipur'
  ],
  'Faridpur': [
    'Alfadanga', 'Bhanga', 'Boalmari', 'Charbhadrasan', 'Faridpur Sadar',
    'Madhukhali', 'Nagarkanda', 'Sadarpur', 'Saltha'
  ],
  'Feni': [
    'Chhagalnaiya', 'Daganbhuiyan', 'Feni Sadar', 'Fulgazi', 'Parshuram', 'Sonagazi'
  ],
  'Gaibandha': [
    'Fulchhari', 'Gaibandha Sadar', 'Gobindaganj', 'Palashbari',
    'Sadullapur', 'Saghata', 'Sundarganj'
  ],
  'Gopalganj': [
    'Gopalganj Sadar', 'Kashiani', 'Kotalipara', 'Muksudpur', 'Tungipara'
  ],
  'Habiganj': [
    'Ajmiriganj', 'Bahubal', 'Baniyachong', 'Chunarughat', 'Habiganj Sadar',
    'Lakhai', 'Madhabpur', 'Nabiganj', 'Sayestaganj'
  ],
  'Jamalpur': [
    'Bakshiganj', 'Dewanganj', 'Islampur', 'Jamalpur Sadar', 'Madarganj',
    'Melandaha', 'Sarishabari'
  ],
  'Jashore': [
    'Abhaynagar', 'Bagherpara', 'Chaugachha', 'Jashore Sadar', 'Jhikargachha',
    'Keshabpur', 'Manirampur', 'Sharsha'
  ],
  'Jhalokati': [
    'Jhalokati Sadar', 'Kathalia', 'Nalchhiti', 'Rajapur'
  ],
  'Jhenaidah': [
    'Harinakundu', 'Jhenaidah Sadar', 'Kaliganj', 'Kotchandpur', 'Maheshpur', 'Shailkupa'
  ],
  'Joypurhat': [
    'Akkelpur', 'Joypurhat Sadar', 'Kalai', 'Khetlal', 'Panchbibi'
  ],
  'Khagrachhari': [
    'Dighinala', 'Guimara', 'Khagrachhari Sadar', 'Lakshmichhari',
    'Mahalchhari', 'Manikchhari', 'Matiranga', 'Panchhari', 'Ramgarh'
  ],
  'Khulna': [
    'Batiaghata', 'Dacope', 'Daulatpur', 'Dighalia', 'Dumuria',
    'Khalishpur', 'Khan Jahan Ali', 'Kotwali', 'Koyra', 'Paikgachha',
    'Phultala', 'Rupsha', 'Sonadanga', 'Terokhada'
  ],
  'Kishoreganj': [
    'Austagram', 'Bajitpur', 'Bhairab', 'Hossainpur', 'Itna', 'Karimganj',
    'Katiadi', 'Kishoreganj Sadar', 'Kuliarchar', 'Mithamain', 'Nikli',
    'Pakundia', 'Tarail'
  ],
  'Kurigram': [
    'Bhurungamari', 'Char Rajibpur', 'Chilmari', 'Kurigram Sadar', 'Nageshwari',
    'Phulbari', 'Rajarhat', 'Raumari', 'Ulipur'
  ],
  'Kushtia': [
    'Bheramara', 'Daulatpur', 'Khoksa', 'Kumarkhali', 'Kushtia Sadar', 'Mirpur'
  ],
  'Lakshmipur': [
    'Kamalnagar', 'Lakshmipur Sadar', 'Raipur', 'Ramganj', 'Ramgati'
  ],
  'Lalmonirhat': [
    'Aditmari', 'Hatibandha', 'Kaliganj', 'Lalmonirhat Sadar', 'Patgram'
  ],
  'Madaripur': [
    'Kalkini', 'Madaripur Sadar', 'Rajoir', 'Shibchar', 'Dasar'
  ],
  'Magura': [
    'Magura Sadar', 'Mohammadpur', 'Shalikha', 'Sreepur'
  ],
  'Manikganj': [
    'Daulatpur', 'Ghior', 'Harirampur', 'Manikganj Sadar', 'Saturia',
    'Shivalaya', 'Singair'
  ],
  'Meherpur': [
    'Gangni', 'Meherpur Sadar', 'Mujibnagar'
  ],
  'Moulvibazar': [
    'Barlekha', 'Juri', 'Kamalganj', 'Kulaura', 'Moulvibazar Sadar',
    'Rajnagar', 'Sreemangal'
  ],
  'Munshiganj': [
    'Gazaria', 'Lohajang', 'Munshiganj Sadar', 'Sirajdikhan', 'Sreenagar', 'Tongibari'
  ],
  'Mymensingh': [
    'Bhaluka', 'Dhobaura', 'Fulbaria', 'Gaffargaon', 'Gauripur', 'Haluaghat',
    'Ishwarganj', 'Muktagachha', 'Mymensingh Sadar', 'Nandail', 'Phulpur',
    'Tara Khanda', 'Trishal'
  ],
  'Naogaon': [
    'Atrai', 'Badalgachhi', 'Dhamoirhat', 'Manda', 'Mohadevpur',
    'Naogaon Sadar', 'Niamatpur', 'Patnitala', 'Porsha', 'Raninagar', 'Sapahar'
  ],
  'Narail': [
    'Kalia', 'Lohagara', 'Narail Sadar'
  ],
  'Narsingdi': [
    'Belabo', 'Monohardi', 'Narsingdi Sadar', 'Palash', 'Raipura', 'Shibpur'
  ],
  'Natore': [
    'Bagatipara', 'Baraigram', 'Gurudaspur', 'Lalpur', 'Naldanga',
    'Natore Sadar', 'Singra'
  ],
  'Netrokona': [
    'Atpara', 'Barhatta', 'Durgapur', 'Kalmakanda', 'Kendua',
    'Madan', 'Mohanganj', 'Netrokona Sadar', 'Purbadhala', 'Khaliajuri'
  ],
  'Nilphamari': [
    'Dimla', 'Domar', 'Jaldhaka', 'Kishoreganj', 'Nilphamari Sadar', 'Saidpur'
  ],
  'Noakhali': [
    'Begumganj', 'Chatkhil', 'Companiganj', 'Hatiya', 'Kabirhat',
    'Noakhali Sadar', 'Senbagh', 'Sonaimuri', 'Subarnachar'
  ],
  'Pabna': [
    'Atgharia', 'Bera', 'Bhangura', 'Chatmohar', 'Faridpur',
    'Ishwardi', 'Pabna Sadar', 'Santhia', 'Sujanagar'
  ],
  'Panchagarh': [
    'Atwari', 'Boda', 'Debiganj', 'Panchagarh Sadar', 'Tetulia'
  ],
  'Patuakhali': [
    'Bauphal', 'Dashmina', 'Dumki', 'Galachipa', 'Kalapara',
    'Mirzaganj', 'Patuakhali Sadar', 'Rangabali'
  ],
  'Pirojpur': [
    'Bhandaria', 'Kawkhali', 'Mathbaria', 'Nazirpur', 'Nesarabad (Swarupkati)',
    'Pirojpur Sadar', 'Zianagar (Indurkani)'
  ],
  'Rajbari': [
    'Baliakandi', 'Goalandaghat', 'Kalukhali', 'Pangsha', 'Rajbari Sadar'
  ],
  'Rajshahi': [
    'Bagha', 'Bagmara', 'Boalia', 'Charghat', 'Durgapur', 'Godagari',
    'Matihar', 'Mohanpur', 'Paba', 'Puthia', 'Rajpara', 'Shah Makhdum', 'Tanore'
  ],
  'Rangamati': [
    'Bagaichhari', 'Barkal', 'Belaichhari', 'Juraichhari', 'Kaptai',
    'Kawkhali', 'Langadu', 'Naniarchar', 'Rajasthali', 'Rangamati Sadar'
  ],
  'Rangpur': [
    'Badarganj', 'Gangachhara', 'Kaunia', 'Mithapukur', 'Pirgachha',
    'Pirganj', 'Rangpur Sadar', 'Taraganj'
  ],
  'Satkhira': [
    'Assasuni', 'Debhata', 'Kalaroa', 'Kaliganj', 'Satkhira Sadar',
    'Shyamnagar', 'Tala'
  ],
  'Shariatpur': [
    'Bhedarganj', 'Damudya', 'Gosairhat', 'Naria', 'Shariatpur Sadar', 'Zajira'
  ],
  'Sherpur': [
    'Jhenaigati', 'Nakla', 'Nalitabari', 'Sherpur Sadar', 'Sreebardi'
  ],
  'Sirajganj': [
    'Belkuchi', 'Chauhali', 'Kamarkhanda', 'Kazipur', 'Raiganj',
    'Shahjadpur', 'Sirajganj Sadar', 'Tarash', 'Ullahpara'
  ],
  'Sunamganj': [
    'Bishwamvarpur', 'Chhatak', 'Dakshin Sunamganj (Shantiganj)', 'Derai',
    'Dharampasha', 'Dowarabazar', 'Jagannathpur', 'Jamalganj', 'Sullah',
    'Sunamganj Sadar', 'Tahirpur'
  ],
  'Sylhet': [
    'Balaganj', 'Beanibazar', 'Bishwanath', 'Companiganj', 'Fenchuganj',
    'Golapganj', 'Gowainghat', 'Jaintiapur', 'Kanaighat', 'Osmani Nagar',
    'South Surma', 'Sylhet Sadar', 'Zakiganj'
  ],
  'Tangail': [
    'Basail', 'Bhuapur', 'Delduar', 'Dhanbari', 'Ghatail', 'Gopalpur',
    'Kalihati', 'Madhupur', 'Mirzapur', 'Nagarpur', 'Sakhipur', 'Tangail Sadar'
  ],
  'Thakurgaon': [
    'Baliadangi', 'Haripur', 'Pirganj', 'Ranisankail', 'Thakurgaon Sadar'
  ],
};

// Flattened list of all locations: "District - Upazila/Thana"
export const ALL_BANGLADESH_LOCATIONS: BangladeshLocation[] = Object.entries(
  BANGLADESH_DISTRICT_UPAZILA_MAP
).flatMap(([district, upazilas]) =>
  upazilas.map((upazila) => ({
    district,
    upazila,
    displayName: `${district} - ${upazila}`,
    zone: district.toLowerCase() === 'dhaka' ? ('inside_dhaka' as const) : ('outside_dhaka' as const),
  }))
);

// Sort alphabetically by displayName
ALL_BANGLADESH_LOCATIONS.sort((a, b) => a.displayName.localeCompare(b.displayName));
